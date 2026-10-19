import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { login, resetFixtures } from "./helpers";

async function fillCode(page: Page, label: string) {
  const pending = page.waitForResponse(response => response.url().endsWith("/api/account/code") && response.request().method() === "POST");
  await page.getByRole("button", { name: `发送${label}`, exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  await page.getByLabel(label, { exact: true }).fill((await response.json()).testCode);
}

test("avatar, password and email settings persist and update the header and login", async ({ page, request, browser }) => {
  await resetFixtures(request);
  await login(page);
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const otherPage = await other.newPage();
  await login(otherPage);
  try {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "设置登录密码", exact: true })).toBeVisible();
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#21634b" } }).png().toBuffer();
    const uploaded = page.waitForResponse(response => response.url().endsWith("/api/account/avatar") && response.request().method() === "POST");
    await page.getByLabel("选择头像图片").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
    const uploadResponse = await uploaded;
    expect(uploadResponse.ok(), await uploadResponse.text()).toBeTruthy();
    await expect(page.getByRole("status").filter({ hasText: "头像已更新" })).toBeVisible();
    await expect(page.locator(".avatar-trigger img")).toBeVisible();
    const image = await page.request.get("/api/account/avatar");
    expect(image.headers()["cache-control"]).toBe("private, no-store");
    expect(await sharp(await image.body()).metadata()).toMatchObject({ width: 256, height: 256, format: "webp" });
    await fillCode(page, "当前邮箱验证码");
    await page.getByLabel("新密码", { exact: true }).fill("Account-password123");
    await page.getByLabel("确认新密码", { exact: true }).fill("Account-password123");
    await page.getByRole("button", { name: "保存密码", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "密码已保存" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "更改密码", exact: true })).toBeVisible();
    expect((await other.request.get("/api/account/avatar")).status()).toBe(401);

    await fillCode(page, "原邮箱验证码");
    await page.getByLabel("新邮箱", { exact: true }).fill("account-new@example.com");
    await fillCode(page, "新邮箱验证码");
    await page.getByRole("button", { name: "保存邮箱", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "邮箱已更新" })).toBeVisible();
    await expect(page.locator(".account-profile")).toContainText("account-new@example.com");
    await page.reload();
    await expect(page.locator(".avatar-trigger img")).toBeVisible();
    await page.getByLabel("用户菜单", { exact: true }).click();
    await expect(page.locator(".account-dropdown")).toContainText("account-new@example.com");
    await page.locator(".account-dropdown").getByRole("button", { name: "退出登录" }).click();
    await page.goto("/login?next=/account");
    await page.getByRole("button", { name: "密码登录", exact: true }).click();
    await page.getByLabel("邮箱", { exact: true }).fill("account-new@example.com");
    await page.getByLabel("密码", { exact: true }).fill("Account-password123");
    await page.locator('.auth-panel form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.locator(".avatar-trigger img")).toBeVisible();
    await page.getByRole("button", { name: "恢复默认", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "已恢复默认头像" })).toBeVisible();
    await expect(page.locator(".avatar-trigger img")).toHaveCount(0);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.png?v=zhi-1");
    await expect(page.locator(".site-brand img")).toHaveAttribute("src", "/brand-mark.svg");
  } finally { await other.close(); }
});

test("account endpoints reject unauthenticated access, CSRF, wrong-purpose codes and unsafe uploads", async ({ page, request }) => {
  await resetFixtures(request);
  for (const path of ["email", "password", "code", "avatar"]) expect((await request.post(`/api/account/${path}`, { data: {} })).status()).toBe(401);
  await login(page);
  const api = page.request;
  expect((await api.post("/api/account/code", { headers: { origin: "https://other.example" }, data: { purpose: "password" } })).status()).toBe(403);
  expect((await api.post("/api/account/avatar", { headers: { "Content-Type": "image/svg+xml" }, data: "<svg/>" })).status()).toBe(415);
  expect((await api.post("/api/account/avatar", { headers: { "Content-Type": "image/png" }, data: "not an image" })).status()).toBe(400);
  expect((await api.post("/api/account/avatar", { headers: { "Content-Type": "image/png" }, data: Buffer.alloc(2 * 1024 * 1024 + 1) })).status()).toBe(413);
  const original = await (await api.post("/api/account/code", { data: { purpose: "email-current" } })).json();
  expect((await api.post("/api/account/password", { data: { code: original.testCode, password: "Account-password123" } })).status()).toBe(401);
  const destination = await (await api.post("/api/account/code", { data: { purpose: "email-new", email: "e2e-b@example.com" } })).json();
  expect((await api.post("/api/account/email", { data: { email: "e2e-b@example.com", currentCode: original.testCode, newCode: destination.testCode } })).status()).toBe(409);
  expect((await api.post("/api/account/email", { data: { email: "different@example.com", currentCode: original.testCode, newCode: destination.testCode } })).status()).toBe(401);
  const passwordCode = await (await api.post("/api/account/code", { data: { purpose: "password" } })).json();
  const change = { code: passwordCode.testCode, password: "Account-password123" };
  expect((await api.post("/api/account/password", { data: change })).ok()).toBeTruthy();
  expect((await api.post("/api/account/password", { data: change })).status()).toBe(401);
  expect((await request.post("/api/auth/password", { data: { email: "e2e-a@example.com", password: "wrong-password" } })).status()).toBe(401);
  expect((await request.post("/api/auth/password", { data: { email: "unknown@example.com", password: "Account-password123" } })).status()).toBe(401);
});
