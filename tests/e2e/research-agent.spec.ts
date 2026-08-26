import { test, expect, type APIRequestContext } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

async function createCollection(request: APIRequestContext, title: string) {
  const response = await request.post("/api/research/collections", { data: { title, description: "研究代理 E2E 专题" } });
  expect(response.status()).toBe(201);
  return (await response.json() as { collection: { id: string } }).collection.id;
}

test("research agent freezes evidence and produces a cited comparison report", async ({ page, browser }) => {
  await login(page);
  const collectionId = await createCollection(page.request, "E2E 代理比较专题");
  expect((await page.request.post(`/api/research/collections/${collectionId}/items`, { data: { targetType: "EVENT", targetId: "e2e-event-ai" } })).status()).toBe(201);
  expect((await page.request.post(`/api/research/collections/${collectionId}/items`, { data: { targetType: "ENTITY", targetId: "e2e-entity-a" } })).status()).toBe(201);

  await page.goto("/research/agent");
  await page.getByLabel("研究专题").selectOption(collectionId);
  await page.getByLabel("对象比较").check();
  await page.getByLabel("比较对象一").selectOption("EVENT:e2e-event-ai");
  await page.getByLabel("比较对象二").selectOption("ENTITY:e2e-entity-a");
  await page.getByLabel("研究问题").fill("比较 E2E AI 事件与 E2E Company 的证据差异");
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/research/agent/tasks") && response.request().method() === "POST");
  await page.getByRole("button", { name: "生成大纲与证据" }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(page).toHaveURL(/task=[^&]+/);
  const taskId = new URL(page.url()).searchParams.get("task");
  expect(taskId).toBeTruthy();
  await expect(page.getByRole("heading", { name: "研究大纲" })).toBeVisible();
  await expect(page.getByText("E2E supporting evidence").first()).toBeVisible();
  await expect(page.getByText("E2E conflicting evidence").first()).toBeVisible();

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "e2e-b@example.com");
  expect((await other.request.post(`/api/research/agent/tasks/${taskId}/confirm`)).status()).toBe(404);
  expect((await other.request.post(`/api/research/agent/tasks/${taskId}/cancel`)).status()).toBe(404);
  expect((await other.request.post(`/api/research/agent/tasks/${taskId}/retry`)).status()).toBe(404);
  await otherContext.close();

  const confirmResponse = page.waitForResponse((response) => response.url().endsWith(`/api/research/agent/tasks/${taskId}/confirm`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "确认并生成报告" }).click();
  expect((await confirmResponse).status()).toBe(200);
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /证据对照/ })).toBeVisible();
  await expect(page.getByText("rules-v1", { exact: true })).toBeVisible();
  await expect(page.locator(".agent-report > ol > li")).toHaveCount(2);
  await expect(page.locator(".agent-report footer a").first()).toHaveAttribute("href", /^#evidence-ev-/);
  await expect(page.getByText("规则模式完成")).toBeVisible();
});

test("research agent refuses unsupported work and preserves cancellable task history", async ({ page }) => {
  await login(page);
  const emptyCollectionId = await createCollection(page.request, "E2E 空专题");
  const refusedResponse = await page.request.post("/api/research/agent/tasks", { data: { collectionId: emptyCollectionId, mode: "CHANGES_30D", question: "过去 30 天发生了什么" } });
  expect(refusedResponse.status()).toBe(201);
  const refusedTask = (await refusedResponse.json() as { task: { id: string; status: string; refusalReason: string } }).task;
  expect(refusedTask.status).toBe("REFUSED");
  expect(refusedTask.refusalReason).toContain("过去 30 天");
  await page.goto(`/research/agent?task=${refusedTask.id}`);
  await expect(page.getByText("无法基于当前专题回答")).toBeVisible();
  await expect(page.getByText("已拒答", { exact: true }).first()).toBeVisible();

  const collectionId = await createCollection(page.request, "E2E 可取消专题");
  await page.request.post(`/api/research/collections/${collectionId}/items`, { data: { targetType: "EVENT", targetId: "e2e-event-ai" } });
  const compareResponse = await page.request.post("/api/research/agent/tasks", { data: { collectionId, mode: "COMPARE", question: "比较专题中的两个对象", targetKeys: ["EVENT:e2e-event-ai", "ENTITY:missing"] } });
  const compareTask = (await compareResponse.json() as { task: { status: string; refusalReason: string } }).task;
  expect(compareTask.status).toBe("REFUSED");
  expect(compareTask.refusalReason).toContain("两个不同");

  const pendingResponse = await page.request.post("/api/research/agent/tasks", { data: { collectionId, mode: "QUESTION", question: "整理当前专题证据" } });
  const pendingTask = (await pendingResponse.json() as { task: { id: string; status: string } }).task;
  expect(pendingTask.status).toBe("AWAITING_CONFIRMATION");
  await page.goto(`/research/agent?task=${pendingTask.id}`);
  await page.getByRole("button", { name: "取消任务" }).click();
  await expect(page.getByText("已取消", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("用户在报告生成前取消任务")).toBeVisible();
  expect((await page.request.post(`/api/research/agent/tasks/${pendingTask.id}/confirm`)).status()).toBe(409);
});
