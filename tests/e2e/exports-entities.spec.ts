import { test, expect } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("exports HTML, Markdown, and JSON templates", async ({ page }) => {
  await login(page);
  for (const format of ["html", "markdown", "json"]) {
    const create = await page.request.post("/api/reports/e2e-digest/export", { headers: { "Idempotency-Key": `e2e-export-${format}` }, data: { template: "learning", format } });
    expect(create.status()).toBe(201);
    const response = await page.request.get((await create.json()).downloadUrl);
    expect(response.ok()).toBeTruthy(); expect(response.headers()["content-disposition"]).toContain(`.${format === "markdown" ? "md" : format}`);
  }
  expect((await page.request.get("/api/reports/e2e-digest/export?format=json")).status()).toBe(405);
});

test("entity detail, relationship filters, search, and merge authorization", async ({ page, browser }) => {
  await login(page); await page.goto("/entities/e2e-entity-a"); await expect(page.getByText("E2E Company", { exact: true })).toBeVisible();
  await page.goto("/relations?kind=entity&relation=COOPERATES_WITH"); await expect(page.locator("span", { hasText: "COOPERATES_WITH" })).toBeVisible();
  const search = await page.request.get("/api/search?q=E2E Company"); expect(search.ok()).toBeTruthy(); expect((await search.json()).items.some((item: { href: string }) => item.href === "/entities/e2e-entity-a")).toBe(true);
  expect((await page.request.post("/api/admin/entities/merge", { data: { sourceId: "e2e-entity-b", targetId: "e2e-entity-a" } })).status()).toBe(403);
  const adminContext = await browser.newContext(); const admin = await adminContext.newPage(); await login(admin, "e2e-admin@example.com"); expect((await admin.request.post("/api/admin/entities/merge", { data: { sourceId: "e2e-entity-b", targetId: "e2e-entity-a", reason: "E2E" } })).ok()).toBeTruthy(); await adminContext.close();
});

test("malicious input is bounded and unknown resources are rejected", async ({ page }) => {
  await login(page);
  expect((await page.request.post("/api/behavior", { data: { action: "<script>alert(1)</script>" } })).status()).toBe(400);
  expect((await page.request.post("/api/feed/e2e-feed-ai/feedback", { data: { report: "x".repeat(5000) } })).ok()).toBeTruthy();
  expect((await page.request.post("/api/reports/not-owned/export", { data: { format: "json" } })).status()).toBe(404);
});
