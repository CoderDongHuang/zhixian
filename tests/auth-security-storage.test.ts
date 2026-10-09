import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { consumeRateRule, checkLatestOtp } from "../lib/auth-security-storage.ts";
import { consumeOtp } from "../lib/auth-claim.ts";
import { sendLoginCode } from "../lib/email.ts";

const isolated = process.env.DATABASE_URL && /^zhixian_.*(?:test|e2e)$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
test("real rate and OTP policies under PostgreSQL contention, without E2E bypass", { skip: !isolated }, async (t) => {
  const db = new PrismaClient();
  const subject = `security-${randomUUID()}`;
  const email = `${subject}@example.com`;
  const rule = { scope: "test-rate", subject, limit: 3, windowMs: 60000, blockMs: 60000 };
  try {
    await t.test("twenty concurrent requests allow exactly three without 500", async () => {
      const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateRule(db, hash, rule)));
      assert.equal(results.filter((blocked) => !blocked).length, 3);
    });
    await t.test("ten concurrent wrong codes lock after exactly five attempts", async () => {
      const otp = await db.emailOtp.create({ data: { email, codeHash: hash("123456"), expiresAt: new Date(Date.now() + 60000) } });
      const results = await Promise.all(Array.from({ length: 10 }, () => checkLatestOtp(db, hash, email, "654321", 5)));
      assert.equal(results.filter((result) => result.otp).length, 0);
      const saved = await db.emailOtp.findUniqueOrThrow({ where: { id: otp.id } });
      assert.equal(saved.attemptCount, 5);
      assert.ok(saved.usedAt && saved.lockedAt);
      assert.equal((await checkLatestOtp(db, hash, email, "123456", 5)).otp, null);
    });
    await t.test("concurrent successful consumption is one-time only", async () => {
      const otp = await db.emailOtp.create({ data: { email, codeHash: hash("123456"), expiresAt: new Date(Date.now() + 60000) } });
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => db.$transaction((tx) => consumeOtp(tx, otp.id))));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    });
  } finally { await db.emailOtp.deleteMany({ where: { email } }); await db.authThrottle.deleteMany({ where: { key: hash(`auth-throttle:${rule.scope}:${subject}`) } }); await db.$disconnect(); }
});
test("production email adapter sends the actual provider contract without real mail", async () => {
  let calls = 0;
  await sendLoginCode("test@example.com", "123456", { env: { NODE_ENV: "production", EMAIL_API_KEY: "mock-only", EMAIL_FROM: "login@example.com" }, fetch: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal((init!.headers as Record<string, string>).Authorization, "Bearer mock-only");
    assert.ok(init!.signal);
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.to, ["test@example.com"]);
    assert.match(body.html, /123456/);
    return Response.json({ id: "mock-mail" });
  } });
  assert.equal(calls, 1);
  await assert.rejects(sendLoginCode("test@example.com", "123456", { env: { NODE_ENV: "production" } }), /not configured/);
  await assert.rejects(sendLoginCode("test@example.com", "123456", { env: { NODE_ENV: "production", EMAIL_API_KEY: "mock", EMAIL_FROM: "test@example.com" }, fetch: async () => new Response("mock error", { status: 429 }) }), /429/);
});
