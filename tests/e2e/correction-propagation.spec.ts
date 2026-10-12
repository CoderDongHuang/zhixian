import { PrismaClient } from "@prisma/client";
import { test, expect, type Page } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

const db = new PrismaClient();
test.beforeEach(async ({ request }) => { await resetFixtures(request); });
test.afterAll(async () => { await db.$disconnect(); });
async function share(page: Page, id: string) {
  const response = await page.request.post(`/api/research/collections/${id}/share`);
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; version: number; url: string };
}

test("source correction propagates through collection, search and new shares while preserving old snapshots", async ({ page, browser }) => {
  await login(page);
  const created = await page.request.post("/api/research/collections", { data: { title: "纠错传播专题" } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).collection.id as string;
  expect((await page.request.post(`/api/research/collections/${id}/items`, { data: { targetType: "EVENT", targetId: "e2e-event-ai", note: "保留个人判断" } })).status()).toBe(201);
  const original = await share(page, id);
  const oldSnapshot = (await db.researchShare.findUniqueOrThrow({ where: { id: original.id } })).snapshot;
  const context = await browser.newContext({ viewport: page.viewportSize() || undefined }), publicPage = await context.newPage();
  try {
    await publicPage.goto(original.url);
    await expect(publicPage.getByText("只读版本 1", { exact: true })).toBeVisible();
    await expect(publicPage.getByRole("heading", { name: "1. E2E AI 深度分析", exact: true })).toBeVisible();

    await db.rawDocument.update({ where: { id: "e2e-doc-ai" }, data: { contentHash: "e2e-propagation-corrected", content: "更正后的支持证据", processingStatus: "PENDING" } });
    await page.goto("/research");
    await expect(page.locator(".collection-item").getByText("内容已撤回或待重新审核（专题记录保留）", { exact: true })).toBeVisible();
    await expect(page.locator(".collection-item").getByText("E2E AI 深度分析", { exact: true })).toHaveCount(0);
    expect((await (await page.request.get("/api/search?q=E2E%20AI%20深度分析")).json()).items).toHaveLength(0);
    const withdrawn = await share(page, id);
    expect(withdrawn.version).toBe(2);
    expect(((await db.researchShare.findUniqueOrThrow({ where: { id: withdrawn.id } })).snapshot as { items: unknown[] }).items).toHaveLength(0);

    await db.rawDocument.update({ where: { id: "e2e-doc-ai" }, data: { processingStatus: "PROCESSED" } });
    const event = await db.event.findUniqueOrThrow({ where: { id: "e2e-event-ai" }, include: { documents: { include: { document: { include: { source: true } } } } } });
    const corrected = await db.analysis.create({ data: {
      eventId: event.id, summary: "更正后可信结论", confidence: 0.95, modelVersion: "e2e-correction", status: "PENDING_REVIEW", inputRevision: event.materialRevision,
      inputManifest: event.documents.map(({ document }) => ({ id: document.id, revision: document.materialRevision, contentHash: document.contentHash, title: document.title, url: document.url, source: document.source.name, publishedAt: document.publishedAt?.toISOString() || null, content: document.content || "" })),
      evidence: { create: { documentId: "e2e-doc-ai", quote: "更正后的支持证据", stance: "SUPPORT" } },
    } });
    await login(page, "e2e-admin@example.com");
    expect((await page.request.post("/api/admin/reviews", { data: { id: corrected.id, status: "APPROVED" } })).status()).toBe(200);
    await login(page);
    const results = (await (await page.request.get("/api/search?q=更正后可信结论")).json()).items;
    expect(results.some((item: { id: string; summary: string }) => item.id === event.id && item.summary === "更正后可信结论")).toBe(true);
    await page.goto("/research");
    await expect(page.locator(".collection-item").getByRole("link", { name: "更正后可信结论", exact: true })).toBeVisible();
    await expect(page.locator(".collection-item").getByText("E2E AI 深度分析", { exact: true })).toHaveCount(0);
    const latest = await share(page, id);
    expect(latest.version).toBe(3);
    await publicPage.goto(latest.url);
    await expect(publicPage.getByText("只读版本 3", { exact: true })).toBeVisible();
    await expect(publicPage.getByRole("heading", { name: "1. 更正后可信结论", exact: true })).toBeVisible();
    await expect(publicPage.getByText("更正后的支持证据", { exact: true })).toBeVisible();
    await expect(publicPage.getByText("保留个人判断", { exact: true })).toBeVisible();
    await expect(publicPage.getByText("E2E AI 深度分析", { exact: true })).toHaveCount(0);
    await publicPage.goto(original.url);
    await expect(publicPage.getByRole("heading", { name: "1. E2E AI 深度分析", exact: true })).toBeVisible();
    await expect(publicPage.getByText("E2E supporting evidence", { exact: true })).toBeVisible();
    await expect(publicPage.getByText("更正后可信结论", { exact: true })).toHaveCount(0);
    expect((await db.researchShare.findUniqueOrThrow({ where: { id: original.id } })).snapshot).toEqual(oldSnapshot);
    expect((await db.researchCollectionItem.findFirstOrThrow({ where: { collectionId: id } })).note).toBe("保留个人判断");
  } finally { await context.close(); }
});
