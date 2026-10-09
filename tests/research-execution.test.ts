import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { claimResearchAttempt, finishResearchAttempt } from "../lib/research-agent-storage.ts";

const database = process.env.DATABASE_URL;
const isolated = database && /^zhixian_.*(?:test|e2e)$/.test(new URL(database).pathname.slice(1));

test("research execution fencing in PostgreSQL", { skip: !isolated }, async (t) => {
  const db = new PrismaClient();
  const user = await db.user.create({ data: { email: `research-test-${randomUUID()}@example.com` } });
  const collection = await db.researchCollection.create({ data: { userId: user.id, title: "Execution test" } });
  const create = () => db.researchAgentTask.create({ data: { userId: user.id, collectionId: collection.id, question: "test", mode: "QUESTION", outline: {}, evidenceSnapshot: [] } });
  const answer = (version: string) => ({ answer: { version }, modelVersion: version, detail: version });
  try {
    await t.test("concurrent claims have one winner", async () => {
      const task = await create();
      const claims = await Promise.all([claimResearchAttempt(db, task, "a"), claimResearchAttempt(db, task, "b")]);
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(await db.researchAgentEvent.count({ where: { taskId: task.id } }), 1);
    });
    await t.test("old successful and failed workers cannot overwrite a newer running or completed attempt", async () => {
      for (const terminal of [false, true]) {
        const task = await create();
        assert.ok(await claimResearchAttempt(db, task, "old"));
        await db.researchAgentTask.update({ where: { id: task.id }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
        const stale = await db.researchAgentTask.findUniqueOrThrow({ where: { id: task.id } });
        const retries = await Promise.all([claimResearchAttempt(db, stale, "new", true), claimResearchAttempt(db, stale, "racer", true)]);
        assert.equal(retries.filter(Boolean).length, 1);
        const current = await db.researchAgentTask.findUniqueOrThrow({ where: { id: task.id } });
        const token = current.executionToken!;
        if (terminal) assert.ok(await finishResearchAttempt(db, task.id, token, answer("new")));
        const count = await db.researchAgentEvent.count({ where: { taskId: task.id } });
        assert.equal(await finishResearchAttempt(db, task.id, "old", answer("old")), false);
        assert.equal(await finishResearchAttempt(db, task.id, "old", null), false);
        assert.equal(await db.researchAgentEvent.count({ where: { taskId: task.id } }), count);
        const after = await db.researchAgentTask.findUniqueOrThrow({ where: { id: task.id } });
        assert.equal(after.status, terminal ? "COMPLETED" : "RUNNING");
        assert.equal(after.modelVersion, terminal ? "new" : null);
        assert.equal(after.error, null);
      }
    });
    await t.test("duplicate terminal writes have one winner and failed attempts can be retried", async () => {
      const task = await create();
      assert.ok(await claimResearchAttempt(db, task, "first"));
      const results = await Promise.all([finishResearchAttempt(db, task.id, "first", null), finishResearchAttempt(db, task.id, "first", null)]);
      assert.equal(results.filter(Boolean).length, 1);
      const failed = await db.researchAgentTask.findUniqueOrThrow({ where: { id: task.id } });
      assert.ok(await claimResearchAttempt(db, failed, "retry", true));
      assert.ok(await finishResearchAttempt(db, task.id, "retry", answer("retry")));
      assert.equal(await db.researchAgentEvent.count({ where: { taskId: task.id } }), 4);
    });
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
