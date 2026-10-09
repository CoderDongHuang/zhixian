import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { login, resetFixtures } from "./helpers";

const db = new PrismaClient();
const mock = createServer((_request, response) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ data: [{ embedding: Array.from({ length: 1024 }, () => 0.1) }] })); });
test.beforeAll(async () => { await new Promise<void>((resolve) => mock.listen(3158, "127.0.0.1", resolve)); });
test.beforeEach(async ({ request }) => { await resetFixtures(request); });
test.afterAll(async () => { await new Promise<void>((resolve, reject) => mock.close((error) => error ? reject(error) : resolve())); await db.$disconnect(); });

test("latest pending/rejected/withdrawn version hides all live surfaces without deleting personal records", async ({ page }) => {
  await login(page);
  await page.request.post("/api/feed/e2e-feed-ai/bookmark", { data: { bookmarked: true } });
  await page.goto("/events/e2e-event-ai");
  await page.request.post("/api/research/subscriptions/e2e-entity-a", { data: { enabled: true } });
  await db.eventRelation.create({ data: { fromEventId: "e2e-event-ai", toEventId: "e2e-event-oss", relation: "R07_PRIVATE_RELATION", confidence: 0.9 } });
  const current = await db.event.findUniqueOrThrow({ where: { id: "e2e-event-ai" } });
  const version = await db.analysis.create({ data: { eventId: current.id, summary: "R07 private summary", confidence: 0.9, status: "PENDING_REVIEW", modelVersion: "e2e", inputRevision: current.materialRevision, analyzedAt: new Date(Date.now() + 1000) } });
  expect((await db.event.findUniqueOrThrow({ where: { id: current.id } })).isPublic).toBe(false);
  const otp = await (await page.request.post("/api/auth/request-code", { data: { email: "e2e-a@example.com" } })).json();
  const native = await (await page.request.post("/api/mobile/auth/verify-code", { data: { email: "e2e-a@example.com", code: otp.testCode, deviceId: "r07-device" } })).json();
  const headers = { Authorization: `Bearer ${native.accessToken}` };
  expect((await page.request.get("/api/mobile/articles/e2e-feed-ai", { headers })).status()).toBe(404);
  expect((await page.request.get("/api/mini/reports/e2e-event-ai", { headers })).status()).toBe(404);
  expect((await (await page.request.get("/api/mini/feed", { headers })).json()).items.some((item: { eventId: string }) => item.eventId === current.id)).toBe(false);
  const search = await page.request.get("/api/search?q=E2E%20AI");
  expect((await search.json()).items.some((item: { id: string }) => item.id === current.id)).toBe(false);
  for (const path of ["/", "/timeline", "/relations?kind=event", "/entities/e2e-entity-a", "/research/timeline?entityId=e2e-entity-a", "/research"]) {
    await page.goto(path);
    await expect(page.locator(`a[href='/events/${current.id}']`)).toHaveCount(0);
  }
  await page.goto(`/events/${current.id}`);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  for (const path of ["/saved", "/history"]) {
    await page.goto(path);
    await expect(page.getByText(/内容已撤回或待重新审核/)).toBeVisible();
    await expect(page.getByText("E2E AI 深度分析")).toHaveCount(0);
  }
  expect(await db.bookmark.count({ where: { feedItemId: "e2e-feed-ai" } })).toBe(1);
  await db.analysis.update({ where: { id: version.id }, data: { status: "AUTO_PUBLISHED", summary: "R07 current public summary" } });
  expect((await db.event.findUniqueOrThrow({ where: { id: current.id } })).isPublic).toBe(true);
  expect((await (await page.request.get("/api/search?q=R07%20current")).json()).items.some((item: { id: string }) => item.id === current.id)).toBe(true);
  expect((await (await page.request.get("/api/search?q=E2E%20AI%20深度分析")).json()).items.some((item: { summary: string }) => item.summary === "E2E AI 深度分析")).toBe(false);
  await db.analysis.update({ where: { id: version.id }, data: { status: "REJECTED" } });
  expect((await db.event.findUniqueOrThrow({ where: { id: current.id } })).isPublic).toBe(false);
  await db.event.update({ where: { id: current.id }, data: { isPublic: true } });
  expect((await db.event.findUniqueOrThrow({ where: { id: current.id } })).isPublic).toBe(false);
});

test("unpublished title and semantic vectors never bypass publication or configured model", async ({ page }) => {
  await login(page);
  const event = await db.event.create({ data: { id: "e2e-r07-hidden", title: "R07 never published title", clusterKey: "e2e-r07-hidden", type: "release" } });
  try {
    expect((await (await page.request.get("/api/search?q=R07%20never%20published")).json()).items).toHaveLength(0);
    if (!process.env.EMBEDDING_API_KEY) test.skip(true, "Local embedding adapter not configured");
    const vector = `[${Array.from({ length: 1024 }, () => 0.1).join(",")}]`;
    await db.$executeRaw`INSERT INTO "Embedding" (id, "documentId", "contentHash", model, dimensions, vector, "createdAt") VALUES ('e2e-r07-vector-ai', 'e2e-doc-ai', 'e2e-r07-vector-ai', 'e2e-search', 1024, ${vector}::vector, now()), ('e2e-r07-vector-oss', 'e2e-doc-oss', 'e2e-r07-vector-oss', 'wrong-model', 1024, ${vector}::vector, now())`;
    const visible = (await (await page.request.get("/api/search?q=no-text-match-r07")).json()).items;
    expect(visible.map((item: { id: string }) => item.id)).toEqual(["e2e-event-ai"]);
    await db.analysis.updateMany({ where: { eventId: "e2e-event-ai" }, data: { status: "REJECTED" } });
    expect((await (await page.request.get("/api/search?q=no-text-match-r07")).json()).items).toHaveLength(0);
  } finally {
    await db.embedding.deleteMany({ where: { id: { startsWith: "e2e-r07-" } } });
    await db.event.delete({ where: { id: event.id } });
  }
});
