import { test, expect } from "@playwright/test";
import { e2eSecret, login, resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("email login, session expiry, and logout", async ({ page, request }) => {
  await login(page);
  await page.goto("/learning"); await expect(page).toHaveURL(/\/learning/);
  await request.patch("/api/test/fixtures", { headers: { "x-e2e-secret": e2eSecret }, data: { action: "expire-sessions", email: "e2e-a@example.com" } });
  await page.reload(); await expect(page).toHaveURL(/\/login\?next=(%2F|\/)learning/);
  await login(page); await page.request.post("/api/auth/logout"); await page.goto("/learning"); await expect(page).toHaveURL(/\/login/);
});

test("learning fallback, replanning, and task completion", async ({ page }) => {
  await login(page); await page.goto("/learning"); await expect(page.getByText("E2E 规则学习路线")).toBeVisible();
  const task = await page.request.patch("/api/learning/tasks/e2e-task"); expect(task.ok()).toBeTruthy(); expect((await task.json()).completed).toBe(true);
  const preference = await page.request.post("/api/preferences", { data: { identity: "开发者", level: "初级", skillDirections: ["Python"], learningGoals: ["技术选型"], topics: ["AI 行业"], itemsPerDigest: 10 } });
  expect((await preference.json()).learningChanged).toBe(true);
  const regenerate = await page.request.post("/api/learning/path/regenerate"); expect(regenerate.ok()).toBeTruthy(); expect((await regenerate.json()).modelVersion).toBe("rules-v1");
});

test("recommendation feedback and IDOR protection", async ({ page, browser }) => {
  await login(page);
  expect((await page.request.post("/api/behavior", { data: { action: "bookmark", feedItemId: "e2e-feed-ai", topic: "AI 行业", value: 2 } })).ok()).toBeTruthy();
  expect((await page.request.post("/api/behavior", { data: { action: "bookmark", feedItemId: "e2e-feed-ai", eventId: "wrong-event" } })).status()).toBe(400);
  expect((await page.request.post("/api/feed/e2e-feed-ai/feedback", { data: { helpful: true } })).ok()).toBeTruthy();
  const otherContext = await browser.newContext(); const other = await otherContext.newPage(); await login(other, "e2e-b@example.com");
  expect((await other.request.patch("/api/learning/tasks/e2e-task")).status()).toBe(404); await otherContext.close();
});
