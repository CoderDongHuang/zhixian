import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { claimWebAccount, consumeOtp, InvalidAuthClaim } from "../lib/auth-claim.ts";

const database = process.env.DATABASE_URL;
const isolated = database && /^zhixian_.*(?:test|e2e)$/.test(new URL(database).pathname.slice(1));

test("invitation and OTP claims are atomic in PostgreSQL", { skip: !isolated }, async (t) => {
  const db = new PrismaClient();
  const prefix = `auth-test-${randomUUID()}`;
  const emailA = `${prefix}-a@example.com`, emailB = `${prefix}-b@example.com`;
  const otp = (email: string) => db.emailOtp.create({ data: { email, codeHash: "test-only", expiresAt: new Date(Date.now() + 60_000) } });
  const claim = (email: string, code: string, otpId: string) => db.$transaction((tx) => claimWebAccount(tx, email, code, otpId));
  try {
    await t.test("a different email cannot consume a bound invitation; transaction rolls back OTP", async () => {
      await db.invitation.create({ data: { code: `${prefix}-bound`, email: emailB } });
      const code = await otp(emailA);
      await assert.rejects(claim(emailA, `${prefix}-bound`, code.id), InvalidAuthClaim);
      assert.equal(await db.user.count({ where: { email: emailA } }), 0);
      assert.equal((await db.emailOtp.findUniqueOrThrow({ where: { id: code.id } })).usedAt, null);
      assert.equal((await db.invitation.findUniqueOrThrow({ where: { code: `${prefix}-bound` } })).usedAt, null);
    });
    await t.test("expired invitations cannot create accounts", async () => {
      await db.invitation.create({ data: { code: `${prefix}-expired`, expiresAt: new Date(0) } });
      await assert.rejects(claim(emailA, `${prefix}-expired`, (await otp(emailA)).id), InvalidAuthClaim);
    });
    await t.test("two different accounts cannot claim one invitation concurrently", async () => {
      await db.invitation.create({ data: { code: `${prefix}-open` } });
      const a = await otp(emailA), b = await otp(emailB);
      const results = await Promise.allSettled([claim(emailA, `${prefix}-open`, a.id), claim(emailB, `${prefix}-open`, b.id)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = results.find((r) => r.status === "rejected");
      assert.ok(rejected?.status === "rejected" && rejected.reason instanceof InvalidAuthClaim);
      assert.equal(await db.user.count({ where: { email: { in: [emailA, emailB] } } }), 1);
      assert.equal(await db.emailOtp.count({ where: { id: { in: [a.id, b.id] }, usedAt: { not: null } } }), 1);
    });
    await t.test("concurrent OTP replay has exactly one winner", async () => {
      const code = await otp(emailA);
      const results = await Promise.allSettled([0, 1].map(() => db.$transaction((tx) => consumeOtp(tx, code.id))));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      await assert.rejects(db.$transaction((tx) => consumeOtp(tx, code.id)), InvalidAuthClaim);
    });
    await t.test("expired and locked OTPs fail at consumption", async () => {
      const code = await otp(emailA);
      await db.emailOtp.update({ where: { id: code.id }, data: { lockedAt: new Date() } });
      await assert.rejects(db.$transaction((tx) => consumeOtp(tx, code.id)), InvalidAuthClaim);
      await db.emailOtp.update({ where: { id: code.id }, data: { lockedAt: null, expiresAt: new Date(0) } });
      await assert.rejects(db.$transaction((tx) => consumeOtp(tx, code.id)), InvalidAuthClaim);
    });
  } finally {
    await db.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await db.emailOtp.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await db.invitation.deleteMany({ where: { code: { startsWith: prefix } } });
    await db.$disconnect();
  }
});
