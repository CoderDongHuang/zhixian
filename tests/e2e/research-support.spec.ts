import { Prisma, PrismaClient } from "@prisma/client";
import { test, expect, type Page } from "@playwright/test";
import type { ResearchAgentAnswer, ResearchAgentEvidence } from "../../lib/research-agent-policy";
import { login, resetFixtures } from "./helpers";

const db = new PrismaClient();
test.beforeEach(async ({ request }) => { await resetFixtures(request); });
test.afterAll(async () => { await db.$disconnect(); });

async function createTask(page: Page) {
  const collectionResponse = await page.request.post("/api/research/collections", { data: { title: "原文支持验证专题" } });
  const collectionId = (await collectionResponse.json()).collection.id;
  expect((await page.request.post(`/api/research/collections/${collectionId}/items`, { data: { targetType: "EVENT", targetId: "e2e-event-ai" } })).status()).toBe(201);
  const response = await page.request.post("/api/research/agent/tasks", { data: { collectionId, mode: "QUESTION", question: "核对原文与冲突" } });
  expect(response.status()).toBe(201);
  return (await response.json()).task.id as string;
}

test("report retains exact original revisions and both stances after a source correction", async ({ page }) => {
  await login(page);
  const taskId = await createTask(page);
  const before = await db.researchAgentTask.findUniqueOrThrow({ where: { id: taskId } });
  const evidence = before.evidenceSnapshot as unknown as ResearchAgentEvidence[];
  expect(evidence).toHaveLength(2);
  for (const item of evidence) {
    expect(item.sourceKind).toBe("ORIGINAL");
    const snapshot = item.sourceSnapshot!;
    expect(snapshot.text.slice(snapshot.quoteStart, snapshot.quoteEnd)).toBe(item.quote);
    expect(snapshot.contentHash).toBeTruthy();
  }
  await db.rawDocument.update({ where: { id: "e2e-doc-ai" }, data: { content: "更新后的原文已经变化", contentHash: "new-research-hash" } });
  const callsBefore = await db.aiCall.count({ where: { scope: "research-agent" } });
  expect((await page.request.post(`/api/research/agent/tasks/${taskId}/confirm`)).status()).toBe(200);
  const after = await db.researchAgentTask.findUniqueOrThrow({ where: { id: taskId } });
  expect(after.modelVersion).toBe("rules-v1");
  expect((await db.researchAgentEvent.findFirstOrThrow({ where: { taskId, status: "COMPLETED" } })).detail).toBe("规则模式完成");
  expect(await db.aiCall.count({ where: { scope: "research-agent" } })).toBe(callsBefore);
  expect(after.evidenceSnapshot).toEqual(before.evidenceSnapshot);
  const answer = after.answer as unknown as ResearchAgentAnswer;
  expect(answer.facts.find((fact) => fact.claim === "E2E conflicting evidence")?.kind).toBe("CONFLICT");
  expect(answer.facts.find((fact) => fact.claim === "E2E supporting evidence")?.kind).toBe("FACT");
  await page.goto(`/research/agent?task=${taskId}`);
  await expect(page.getByText("原文摘录 · 材料版本 1").first()).toBeVisible();
  await expect(page.locator(".agent-report").getByText(/冲突材料/)).toBeVisible();
});

test("missing original manifests produce labelled secondary summaries, never original citations", async ({ page }) => {
  await login(page);
  await db.analysis.updateMany({ where: { eventId: "e2e-event-ai" }, data: { inputManifest: Prisma.DbNull } });
  const taskId = await createTask(page);
  const task = await db.researchAgentTask.findUniqueOrThrow({ where: { id: taskId } });
  const evidence = task.evidenceSnapshot as unknown as ResearchAgentEvidence[];
  expect(evidence).toHaveLength(1);
  expect(evidence[0].sourceKind).toBe("ANALYSIS_SUMMARY");
  expect(evidence[0].documentId).toBeNull();
  expect(evidence[0].sourceUrl).toBe("/events/e2e-event-ai");
  expect((await page.request.post(`/api/research/agent/tasks/${taskId}/confirm`)).status()).toBe(200);
  const result = await db.researchAgentTask.findUniqueOrThrow({ where: { id: taskId } });
  expect((result.answer as unknown as ResearchAgentAnswer).facts.every((fact) => fact.kind === "CONTEXT")).toBe(true);
  await page.goto(`/research/agent?task=${taskId}`);
  await expect(page.getByText("二手分析摘要", { exact: true })).toBeVisible();
  await expect(page.locator(".agent-report").getByText(/背景材料/)).toBeVisible();
});
