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
  await expect(page.getByRole("link", { name: /事件：E2E AI Event/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /实体：E2E Company/ })).toBeVisible();
  await expect(page.getByText("先修：E2E 先修任务 · 已完成")).toBeVisible();
  await page.getByLabel("实践产出").fill("这是一个明确满足最小长度要求的事件实践测试产出，用于验证质量评分和提交链路。");
  await page.getByLabel("E2E AI Event").check(); await page.getByLabel("忽略证据").check();
  await page.getByLabel("完成质量自评").selectOption("4"); await page.getByLabel("复盘").fill("我会依据已发布分析继续检查原始来源，并验证事件影响和证据。");
  await page.getByRole("button", { name: "提交并评分" }).click(); await expect(page.getByRole("status")).toContainText("质量得分 63"); await expect(page.getByRole("status")).toContainText("已加入 1 个错题复习");
  const due = await page.request.patch("/api/test/fixtures", { headers: { "x-e2e-secret": e2eSecret }, data: { action: "due-learning-reviews" } }); const reviewId = (await due.json()).reviewId;
  const review = await page.request.post(`/api/learning/reviews/${reviewId}`, { data: { answers: ["E2E AI Event"] } }); expect(review.ok()).toBeTruthy(); expect((await review.json()).correct).toBe(true);
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
  expect((await other.request.post("/api/learning/tasks/e2e-task/attempts", { data: { answers: {}, output: "越权提交内容应当被拒绝而不能写入其他用户任务。", reflection: "越权提交内容应当被拒绝。", selfRating: 3 } })).status()).toBe(404); await otherContext.close();
});
