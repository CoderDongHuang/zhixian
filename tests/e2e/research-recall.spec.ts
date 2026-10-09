import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import type { ResearchAgentEvidence } from "../../lib/research-agent-policy";
import { login, resetFixtures } from "./helpers";

const db = new PrismaClient();
const prefix = "e2e-r06-";
test.beforeEach(async ({ request }) => { await resetFixtures(request); });
test.afterEach(async () => { await db.event.deleteMany({ where: { id: { startsWith: prefix } } }); });
test.afterAll(async () => { await db.$disconnect(); });

test("recent frozen material survives old mentions, old quotes and future dates", async ({ page }) => {
  await login(page);
  const baseline = Date.now() - 60_000;
  const material = (id: string, time: number) => ({ id, revision: 1, contentHash: id, title: id, url: `https://example.com/${id}`, source: "test", content: `Original ${id}`, publishedAt: new Date(time).toISOString() });
  for (let index = 0; index < 56; index++) {
    const id = `${prefix}${index}`;
    const documents = index < 55
      ? [material(`${id}-old`, baseline - 40 * 86_400_000)]
      : [...Array.from({ length: 60 }, (_, number) => material(`${id}-old-${number}`, baseline - 40 * 86_400_000)), material(`${id}-recent`, baseline), material(`${id}-future`, baseline + 12 * 3_600_000)];
    await db.event.create({ data: { id, title: id, clusterKey: id, type: "release", mentions: { create: { entityId: "e2e-entity-a" } }, analyses: { create: { summary: id, confidence: 0.9, status: "AUTO_PUBLISHED", modelVersion: "e2e", analyzedAt: new Date(baseline), inputRevision: 0, inputManifest: documents } } } });
  }
  const collectionId = (await (await page.request.post("/api/research/collections", { data: { title: "近期证据召回" } })).json()).collection.id;
  await page.request.post(`/api/research/collections/${collectionId}/items`, { data: { targetType: "ENTITY", targetId: "e2e-entity-a" } });
  const response = await page.request.post("/api/research/agent/tasks", { data: { collectionId, mode: "CHANGES_30D", question: "查看近期变化" } });
  expect(response.status()).toBe(201);
  const task = await db.researchAgentTask.findUniqueOrThrow({ where: { id: (await response.json()).task.id } });
  expect((task.outline as { generatedAt: string }).generatedAt).toBe(task.createdAt.toISOString());
  const evidence = task.evidenceSnapshot as unknown as ResearchAgentEvidence[];
  expect(evidence.some((item) => item.documentId === `${prefix}55-recent`)).toBe(true);
  expect(evidence.some((item) => item.documentId?.includes("-old") || item.documentId?.includes("-future"))).toBe(false);
  expect(evidence.every((item) => Date.parse(item.occurredAt) <= task.createdAt.getTime() && Date.parse(item.occurredAt) >= task.createdAt.getTime() - 30 * 86_400_000)).toBe(true);
  const second = await page.request.post("/api/research/agent/tasks", { data: { collectionId, mode: "CHANGES_30D", question: "再次核对排序" } });
  const again = await db.researchAgentTask.findUniqueOrThrow({ where: { id: (await second.json()).task.id } });
  expect(again.evidenceSnapshot).toEqual(task.evidenceSnapshot);
});
