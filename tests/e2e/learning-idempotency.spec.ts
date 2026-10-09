import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

const prisma = new PrismaClient();
const submission = { answers: { event: ["E2E AI Event"], impact: ["验证推荐和交互"] }, output: "这是一个明确满足最小长度要求的实践测试产出，用于验证提交重试不重复计分和推进复习。", reflection: "我会继续检查原始来源并验证结论，保证证据与判断相互对应。", selfRating: 4 };
test.beforeEach(async ({ request }) => { await resetFixtures(request); });
test.afterAll(async () => { await prisma.$disconnect(); });

test("concurrent retries count one attempt, review and sync change; new key is a new attempt", async ({ page }) => {
  await login(page);
  const key = randomUUID();
  const post = (data = submission, requestId = key) => page.request.post("/api/learning/tasks/e2e-task/attempts", { headers: { "Idempotency-Key": requestId }, data });
  const responses = await Promise.all(Array.from({ length: 6 }, () => post()));
  for (const response of responses) expect(response.status()).toBe(200);
  const original = await responses[0].json();
  for (const response of responses) expect(await response.json()).toEqual(original);
  expect(await prisma.learningAttempt.count({ where: { taskId: "e2e-task" } })).toBe(1);
  expect((await prisma.learningTask.findUniqueOrThrow({ where: { id: "e2e-task" } })).attemptCount).toBe(1);
  expect((await prisma.learningReview.findMany({ where: { taskId: "e2e-task" } })).map((review) => review.repetition)).toEqual([1, 1]);
  expect(await prisma.syncChange.count({ where: { userId: "e2e-user-a", resource: "learning_task", resourceId: "e2e-task" } })).toBe(1);
  expect((await post({ ...submission, selfRating: 5 })).status()).toBe(409);
  const reordered = { ...submission, answers: { impact: submission.answers.impact, event: submission.answers.event } };
  expect(await (await post(reordered)).json()).toEqual(original);
  expect((await post(submission, randomUUID())).status()).toBe(200);
  expect(await prisma.learningAttempt.count({ where: { taskId: "e2e-task" } })).toBe(2);
  expect((await prisma.learningReview.findMany({ where: { taskId: "e2e-task" } })).map((review) => review.repetition)).toEqual([2, 2]);
  // A replay returns its original result even after later attempts or exercise edits.
  await prisma.learningTask.update({ where: { id: "e2e-task" }, data: { exercise: {} } });
  expect(await (await post()).json()).toEqual(original);
});

test("missing or invalid request identifiers do not write learning state", async ({ page }) => {
  await login(page);
  for (const key of [null, "short", "x".repeat(129), "invalid key"]) {
    const response = await page.request.post("/api/learning/tasks/e2e-task/attempts", { headers: key ? { "Idempotency-Key": key } : {}, data: submission });
    expect(response.status()).toBe(400);
  }
  expect(await prisma.learningAttempt.count({ where: { taskId: "e2e-task" } })).toBe(0);
  expect(await prisma.learningReview.count({ where: { taskId: "e2e-task" } })).toBe(0);
});

test("concurrent distinct tasks preserve path progress and distinct attempts", async ({ page }) => {
  await login(page);
  const original = await prisma.learningTask.findUniqueOrThrow({ where: { id: "e2e-task" } });
  await prisma.learningTask.create({ data: { id: "e2e-task-second", userId: original.userId, pathId: original.pathId, title: "E2E second task", description: original.description, scheduledFor: original.scheduledFor, taskType: original.taskType, exercise: original.exercise! } });
  const responses = await Promise.all(["e2e-task", "e2e-task-second"].map((id) => page.request.post(`/api/learning/tasks/${id}/attempts`, { headers: { "Idempotency-Key": randomUUID() }, data: submission })));
  for (const response of responses) expect(response.status()).toBe(200);
  expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: "e2e-path" } })).progress).toBe(95);
});

test("lost response releases the button and retry reuses the request identifier", async ({ page }) => {
  await login(page); await page.goto("/learning");
  await page.getByLabel("实践产出").fill(submission.output);
  await page.getByLabel("E2E AI Event").check(); await page.getByLabel("验证推荐和交互").check();
  await page.getByLabel("完成质量自评").selectOption("4"); await page.getByLabel("复盘").fill(submission.reflection);
  const keys: string[] = [];
  await page.route("**/api/learning/tasks/e2e-task/attempts", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    const response = await route.fetch();
    if (keys.length === 1) await route.abort("failed"); else await route.fulfill({ response });
  });
  const button = page.getByRole("button", { name: "提交并评分" });
  await button.click(); await expect(page.getByRole("status")).toContainText("提交结果尚未确认");
  await expect(button).toBeEnabled();
  await page.reload();
  await page.getByLabel("实践产出").fill(submission.output);
  await page.getByLabel("E2E AI Event").check(); await page.getByLabel("验证推荐和交互").check();
  await page.getByLabel("完成质量自评").selectOption("4"); await page.getByLabel("复盘").fill(submission.reflection);
  await page.getByRole("button", { name: "再次提交" }).click();
  await expect(page.getByRole("status")).toContainText("质量得分 98");
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  expect(await prisma.learningAttempt.count({ where: { taskId: "e2e-task" } })).toBe(1);
});
