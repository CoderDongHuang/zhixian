import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { allocateResearchShare } from "../lib/research-share-storage.ts";

const isolated = process.env.DATABASE_URL && /^zhixian_.*(?:test|e2e)$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1));
test("atomic share allocation and immutable snapshots in PostgreSQL", { skip: !isolated }, async (t) => {
  const db = new PrismaClient();
  const user = await db.user.create({ data: { email: `share-${randomUUID()}@example.com` } });
  const collection = await db.researchCollection.create({ data: { userId: user.id, title: "original" } });
  const create = (userId = user.id) => allocateResearchShare(db, userId, collection.id, 30, async (_tx, value, version) => ({ title: value.title, version }));
  try {
    await t.test("eight concurrent requests allocate unique increasing versions", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => create()));
      assert.deepEqual(results.map((r) => r!.share.version).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.equal(new Set(results.map((r) => r!.token)).size, 8);
    });
    await t.test("later edits and shares do not alter earlier snapshots", async () => {
      const before = await db.researchShare.findMany({ where: { collectionId: collection.id }, orderBy: { version: "asc" } });
      await db.researchCollection.update({ where: { id: collection.id }, data: { title: "modified" } });
      assert.equal((await create())!.share.version, 9);
      const after = await db.researchShare.findMany({ where: { collectionId: collection.id, version: { lte: 8 } }, orderBy: { version: "asc" } });
      assert.deepEqual(after, before);
    });
    await t.test("non-owner cannot allocate and database rejects duplicate version", async () => {
      assert.equal(await create("non-owner"), null);
      const share = await db.researchShare.findFirstOrThrow({ where: { collectionId: collection.id } });
      await assert.rejects(db.researchShare.create({ data: { collectionId: collection.id, createdById: user.id, tokenHash: randomUUID(), version: share.version, snapshot: {} } }), { code: "P2002" });
    });
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
});
