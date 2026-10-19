import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword, validPassword, verifyPassword } from "../lib/password.ts";
import { checkAccountCode, consumeAccountCode, requireUnchangedAccount, revokeOtherSessions } from "../lib/account-storage.ts";
import { readAccountJson, sameOrigin } from "../lib/account-input.ts";

test("password hashes are salted, reject wrong passwords and tolerate absent hashes", async () => {
  assert.equal(validPassword("short1"), false);
  assert.equal(validPassword("onlyletterslong"), false);
  assert.equal(validPassword("12345678901"), false);
  assert.equal(validPassword("x1".repeat(65)), false);
  assert.equal(validPassword("a-long-password1"), true);
  const first = await hashPassword("a-long-password1");
  const second = await hashPassword("a-long-password1");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a-long-password1", first), true);
  assert.equal(await verifyPassword("wrong-password1", first), false);
  assert.equal(await verifyPassword("a-long-password1", null), false);
  assert.equal(await verifyPassword("a-long-password1", "malformed"), false);
});

test("account mutations reject cross-origin requests and oversized or malformed bodies", async () => {
  assert.equal(sameOrigin(new Request("https://example.com/api/account/email", { headers: { origin: "https://evil.example" } }), "https://example.com"), false);
  assert.equal(sameOrigin(new Request("https://example.com/api/account/email", { headers: { "sec-fetch-site": "cross-site" } }), "https://example.com"), false);
  assert.equal(sameOrigin(new Request("https://example.com/api/account/email", { headers: { origin: "https://example.com" } }), "https://example.com"), true);
  assert.equal(sameOrigin(new Request("http://localhost:3000/api/account/email", { headers: { origin: "https://example.com" } }), "https://example.com"), true);
  assert.equal(sameOrigin(new Request("http://localhost:3000/api/account/email", { headers: { origin: "https://evil.example", "x-forwarded-host": "evil.example" } }), "https://example.com"), false);
  for (const body of ["[]", "null", "{", JSON.stringify({ password: "x".repeat(8200) })]) {
    assert.equal(await readAccountJson(new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body })), null);
  }
});

const database = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const isolated = database && ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) && /^zhixian_.*(?:test|e2e)$/.test(database.pathname.slice(1));
test("account challenges enforce scope, attempts, expiry, replay and session revocation", { skip: !isolated }, async t => {
  const db = new PrismaClient();
  const user = await db.user.create({ data: { email: `account-${randomUUID()}@example.com` } });
  const data = { userId: user.id, purpose: "password", email: user.email!, codeHash: "correct-hash", expiresAt: new Date(Date.now() + 60_000) };
  try {
    await t.test("user, purpose and destination cannot be substituted", async () => {
      await db.accountVerification.create({ data });
      assert.equal(await checkAccountCode(db, "another-user", "password", user.email!, "correct-hash"), null);
      assert.equal(await checkAccountCode(db, user.id, "email-new", user.email!, "correct-hash"), null);
      assert.equal(await checkAccountCode(db, user.id, "password", "other@example.com", "correct-hash"), null);
    });
    await t.test("concurrent invalid codes exhaust exactly five attempts", async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => checkAccountCode(db, user.id, "password", user.email!, "incorrect-hash")));
      assert.equal(results.filter(Boolean).length, 0);
      assert.equal((await db.accountVerification.findUniqueOrThrow({ where: { userId_purpose: { userId: user.id, purpose: "password" } } })).attempts, 5);
      assert.equal(await checkAccountCode(db, user.id, "password", user.email!, "correct-hash"), null);
    });
    await t.test("expired challenges fail and concurrent consumption succeeds once", async () => {
      await db.accountVerification.deleteMany({ where: { userId: user.id } });
      const expired = await db.accountVerification.create({ data: { ...data, expiresAt: new Date(Date.now() - 1000) } });
      assert.equal(await checkAccountCode(db, user.id, "password", user.email!, "correct-hash"), null);
      await assert.rejects(db.$transaction(tx => consumeAccountCode(tx, expired.id, expired.codeHash)), /ACCOUNT_CODE_EXPIRED/);
      await db.accountVerification.delete({ where: { id: expired.id } });
      const active = await db.accountVerification.create({ data });
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => db.$transaction(tx => consumeAccountCode(tx, active.id, active.codeHash))));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    });
    await t.test("credential changes keep only the current session and reject stale requests", async () => {
      const token = randomUUID();
      await db.session.createMany({ data: [token, randomUUID()].map(tokenHash => ({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) })) });
      const code = await db.accountVerification.create({ data });
      await db.$transaction(async tx => {
        await requireUnchangedAccount(tx, user.id, user.email, token);
        await consumeAccountCode(tx, code.id, code.codeHash);
        await revokeOtherSessions(tx, user.id, token);
        await tx.user.update({ where: { id: user.id }, data: { email: `changed-${user.id}@example.com` } });
      });
      assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
      assert.equal(await db.accountVerification.count({ where: { userId: user.id } }), 0);
      await assert.rejects(db.$transaction(tx => requireUnchangedAccount(tx, user.id, user.email, token)), /ACCOUNT_CODE_EXPIRED/);
    });
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
});
