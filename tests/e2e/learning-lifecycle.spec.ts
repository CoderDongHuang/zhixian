import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { learningDayKey } from "../../lib/learning-day";
import { login, resetFixtures } from "./helpers";

const db = new PrismaClient();
test.beforeEach(async ({ request }) => { await resetFixtures(request); });
test.afterAll(async () => { await db.$disconnect(); });

test("GET and prefetch never write reading or learning state; explicit actions do", async ({ page }) => {
  await login(page, "e2e-b@example.com");
  const userId = "e2e-user-b";
  for (const url of ["/events/e2e-event-ai", "/learning"]) {
    expect((await page.request.get(url)).ok()).toBeTruthy();
    expect((await page.request.get(url, { headers: { "next-router-prefetch": "1", RSC: "1" } })).ok()).toBeTruthy();
    await page.goto(url);
  }
  expect(await db.readHistory.count({ where: { userId } })).toBe(0);
  expect(await db.syncChange.count({ where: { userId, resource: "read" } })).toBe(0);
  expect(await db.learningPath.count({ where: { userId } })).toBe(0);
  expect(await db.learningTask.count({ where: { userId } })).toBe(0);
  const initialized = page.waitForResponse(response => response.url().endsWith("/api/learning/initialize") && response.request().method() === "POST");
  await page.getByRole("button", { name: "生成今日学习任务" }).click();
  const initializationResponse = await initialized;
  expect(initializationResponse.ok()).toBeTruthy();
  await expect(page.locator(".today-task h2")).toBeVisible();
  expect(await db.learningTask.count({ where: { userId } })).toBe(1);
  await page.goto("/events/e2e-event-ai");
  await page.getByRole("button", { name: "标记已读" }).click();
  await expect(page.getByRole("button", { name: "已读", exact: true })).toBeVisible();
  expect(await db.readHistory.count({ where: { userId } })).toBe(1);
  expect(await db.syncChange.count({ where: { userId, resource: "read", resourceId: "e2e-feed-ai" } })).toBe(1);
  expect(await db.syncState.count({ where: { userId, resource: "read", resourceId: "e2e-feed-ai" } })).toBe(1);
});

test("concurrent learning initialization and replanning retain one active path and one daily task", async ({ page }) => {
  await login(page, "e2e-b@example.com");
  for (const timezone of ["Asia/Shanghai", "UTC"]) {
    const userId = "e2e-user-b";
    await db.learningPath.deleteMany({ where: { userId } });
    await db.userPreference.upsert({ where: { userId }, create: { userId, timezone }, update: { timezone } });
    const responses = await Promise.all(Array.from({ length: 8 }, () => page.request.post("/api/learning/initialize")));
    expect(responses.every((r) => r.ok())).toBe(true);
    const ids = await Promise.all(responses.map(async (r) => (await r.json()).taskId));
    expect(new Set(ids).size).toBe(1);
    expect(await db.learningPath.count({ where: { userId, active: true } })).toBe(1);
    const task = await db.learningTask.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(task.dayKey).toBe(learningDayKey(new Date(), timezone));
    expect(task.dayTimezone).toBe(timezone);
    const replans = await Promise.all(Array.from({ length: 4 }, () => page.request.post("/api/learning/path/regenerate")));
    expect(replans.every((r) => r.ok())).toBe(true);
    expect(await db.learningPath.count({ where: { userId, active: true } })).toBe(1);
    expect((await page.request.post("/api/learning/initialize")).ok()).toBe(true);
    const active = await db.learningPath.findFirstOrThrow({ where: { userId, active: true } });
    expect(await db.learningTask.count({ where: { pathId: active.id, dayKey: task.dayKey } })).toBe(1);
  }
});

test("user timezone day keys have exact boundaries independent of server timezone", async () => {
  const before = new Date("2026-10-09T15:59:59.999Z"), after = new Date("2026-10-09T16:00:00.000Z");
  expect(learningDayKey(before, "Asia/Shanghai")).toBe("2026-10-09");
  expect(learningDayKey(after, "Asia/Shanghai")).toBe("2026-10-10");
  expect(learningDayKey(after, "UTC")).toBe("2026-10-09");
  expect(learningDayKey(new Date("2026-10-10T00:00:00Z"), "UTC")).toBe("2026-10-10");
});
