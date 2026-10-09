import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { saveWebPushIntent } from "../lib/web-push-storage.ts";

const isolated = process.env.DATABASE_URL && /^zhixian_.*(?:test|e2e)$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1));
test("push intention ordering and ownership in PostgreSQL", { skip: !isolated }, async (t) => {
  const db = new PrismaClient();
  const users = await Promise.all([0, 1].map(() => db.user.create({ data: { email: `push-${randomUUID()}@example.com`, preference: { create: {} } } })));
  const endpoint = `https://push.example.com/${randomUUID()}`;
  const now = Date.now();
  const input = { endpoint, changedAt: now, enabled: true, keys: { auth: "a", p256dh: "p" } };
  try {
    await t.test("concurrent owners have one winner without subscription transfer", async () => {
      const results = await Promise.all(users.map((user) => saveWebPushIntent(db, user.id, input)));
      assert.equal(results.filter(Boolean).length, 1);
    });
    const owner = (await db.deviceSubscription.findUniqueOrThrow({ where: { endpoint } })).userId;
    await t.test("late enable cannot resurrect a disabled endpoint", async () => {
      assert.equal(await saveWebPushIntent(db, owner, { endpoint, changedAt: now + 2, enabled: false }), true);
      assert.equal(await saveWebPushIntent(db, owner, input), false);
      assert.equal(await db.deviceSubscription.count({ where: { endpoint } }), 0);
      assert.equal((await db.userPreference.findUniqueOrThrow({ where: { userId: owner } })).pushEnabled, false);
      assert.equal(await saveWebPushIntent(db, owner, { endpoint, changedAt: now + 2, enabled: false }), true);
    });
    await t.test("newer enable is accepted and preferences track actual subscriptions", async () => {
      assert.equal(await saveWebPushIntent(db, owner, { ...input, changedAt: now + 3 }), true);
      assert.equal((await db.userPreference.findUniqueOrThrow({ where: { userId: owner } })).pushEnabled, true);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }); await db.$disconnect(); }
});
