import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

test("operations endpoint is protected and homepage exposes current content freshness", async ({ page, request }, info) => {
  await resetFixtures(request);
  expect((await request.get("/api/admin/operations")).status()).toBe(403);
  expect((await request.get("/api/admin/operations", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(403);
  await login(page);
  expect((await page.request.get("/api/admin/operations")).status()).toBe(403);
  await login(page, "e2e-admin@example.com");
  const response = await page.request.get("/api/admin/operations");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const metrics = await response.json();
  expect(metrics.state).toBe("paused");
  expect(Array.isArray(metrics.metrics.sources)).toBeTruthy();
  expect(metrics.metrics.analysisBacklog.pending).toBeGreaterThanOrEqual(0);
  if (process.env.MONITOR_TOKEN) {
    const monitored = await request.get("/api/admin/operations", { headers: { Authorization: `Bearer ${process.env.MONITOR_TOKEN}` } });
    expect(monitored.status()).toBe(200);
  }
  const db = new PrismaClient();
  try {
    const published = await db.analysis.findMany({ where: { status: { in: ["AUTO_PUBLISHED", "APPROVED"] }, event: { isPublic: true } }, orderBy: { analyzedAt: "desc" }, take: 1 });
    await page.goto("/");
    const freshness = page.getByTestId("content-freshness");
    await expect(freshness).toBeVisible();
    await expect(freshness).toContainText("采集已暂停");
    await expect(freshness.locator("time")).toHaveAttribute("datetime", published[0].analyzedAt.toISOString());
    expect(await freshness.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    await page.screenshot({ path: info.outputPath("operations-freshness.png"), fullPage: true });
  } finally { await db.$disconnect(); }
});
