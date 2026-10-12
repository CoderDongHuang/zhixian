import { APIRequestContext, Page, expect } from "@playwright/test";

export const e2eSecret = process.env.E2E_TEST_SECRET || "e2e-local-secret";
export async function resetFixtures(request: APIRequestContext) {
  const response = await request.post("/api/test/fixtures", { headers: { "x-e2e-secret": e2eSecret }, data: { action: "setup" } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
export async function login(page: Page, email = "e2e-a@example.com") {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  const otpResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/request-code") && response.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  const { testCode } = await (await otpResponse).json();
  await page.locator('input[inputmode="numeric"]').fill(testCode);
  const verifyResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/verify-code") && response.request().method() === "POST");
  await page.locator('form button[type="submit"]').click();
  expect((await verifyResponse).ok()).toBeTruthy();
  await page.waitForURL(/\/(onboarding|$)/);
}
