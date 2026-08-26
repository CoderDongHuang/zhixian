import { test, expect } from "@playwright/test";
import { resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("trend monitoring explains all four domains, raw metrics, gaps, and backtested forecasts", async ({ page }) => {
  await page.goto("/trends?days=30");
  await expect(page.getByRole("heading", { name: "可解释指标，而不是黑箱判断" })).toBeVisible();
  for (const subject of ["E2E AI Repository", "E2E Model Pro", "E2E AI Papers", "E2E AI Jobs"]) await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await expect(page.getByText("仅包含授权样本，不代表全市场")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await Promise.all([
    page.waitForURL(/\/trends\/e2e-github\?days=30$/),
    page.getByRole("link", { name: "E2E AI Repository" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Stars" })).toBeVisible();
  await expect(page.getByText("80% 区间：250 个 至 350 个")).toBeVisible();
  await expect(page.getByText(/MAE 3.2 个/)).toBeVisible();
  await expect(page.getByText(/新快照超出预测区间/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "原始快照与数据缺口" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("贡献者");
  await page.goto("/trends/e2e-model?days=30");
  await expect(page.getByText(/预测已失效：训练窗口后已有新快照/)).toBeVisible();
  await page.goto("/trends?category=JOB&days=7");
  await expect(page.getByRole("heading", { name: "E2E AI Jobs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Model Pro" })).toHaveCount(0);
});
