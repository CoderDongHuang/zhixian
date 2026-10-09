import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login, resetFixtures } from "./helpers";

test("an ingested correction immediately hides cached conclusions and preserves bookmarks", async ({ page, request }) => {
  await resetFixtures(request);
  await login(page);
  await page.goto("/");
  await expect(page.getByText("E2E AI 深度分析").first()).toBeVisible();
  await page.request.post("/api/feed/e2e-feed-ai/bookmark", { data: { bookmarked: true } });
  const db = new PrismaClient();
  try {
    const link = await db.eventDocument.findFirstOrThrow({ where: { eventId: "e2e-event-ai" } });
    await db.rawDocument.update({ where: { id: link.documentId }, data: { contentHash: "e2e-corrected", content: "更正后的测试原文", processingStatus: "PENDING" } });
    await page.reload();
    await expect(page.getByText("E2E AI 深度分析")).toHaveCount(0);
    await page.goto("/events/e2e-event-ai");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByText("E2E AI 深度分析")).toHaveCount(0);
    expect(await db.bookmark.count({ where: { feedItemId: "e2e-feed-ai" } })).toBe(1);
  } finally { await db.$disconnect(); }
});
