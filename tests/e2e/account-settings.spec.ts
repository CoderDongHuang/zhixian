import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
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
    await page.getByRole("dialog", { name: "裁剪头像" }).getByRole("button", { name: "确认并保存" }).click();
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

test("large originals are cropped locally; cancel, wheel, drag and save work", async ({ page, request }) => {
  await resetFixtures(request);
  await login(page);
  await page.goto("/account");
  const pixels = randomBytes(2200 * 1400 * 3);
  const png = await sharp(pixels, { raw: { width: 2200, height: 1400, channels: 3 } }).composite([{ input: await sharp({ create: { width: 1000, height: 1000, channels: 3, background: "#f01010" } }).png().toBuffer(), left: 600, top: 200 }]).png().toBuffer();
  expect(png.length).toBeGreaterThan(2 * 1024 * 1024);
  let uploads = 0;
  page.on("request", incoming => { if (incoming.url().endsWith("/api/account/avatar") && incoming.method() === "POST") uploads++; });
  const choose = () => page.getByLabel("选择头像图片").setInputFiles({ name: "large.png", mimeType: "image/png", buffer: png });
  await choose();
  const crop = page.getByRole("dialog", { name: "裁剪头像" });
  await expect(crop.getByRole("button", { name: "确认并保存" })).toBeEnabled();
  expect(uploads).toBe(0);
  await crop.getByRole("button", { name: "取消", exact: true }).click();
  await expect(crop).toHaveCount(0);
  expect(uploads).toBe(0);
  await choose();
  await expect(crop.getByRole("button", { name: "确认并保存" })).toBeEnabled();
  const surface = crop.getByLabel("头像裁剪区域", { exact: false });
  await surface.hover();
  await page.mouse.wheel(0, -140);
  await expect.poll(async () => Number(await crop.getByRole("slider", { name: "头像缩放" }).inputValue())).toBeGreaterThan(1);
  await crop.getByRole("button", { name: "重置", exact: true }).click();
  await expect(crop.getByRole("slider", { name: "头像缩放" })).toHaveValue("1");
  await crop.getByRole("slider", { name: "头像缩放" }).fill("2.5");
  // The output must reflect dragging, rather than silently uploading the original.
  const before = await surface.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 15, { steps: 5 });
  await page.mouse.up();
  // Move farther toward the noisy edge so the canvas pixels also change.
  await surface.focus();
  for (let index = 0; index < 20; index++) await surface.press("ArrowRight");
  await expect.poll(() => surface.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(before);
  const saved = page.waitForResponse(response => response.url().endsWith("/api/account/avatar") && response.request().method() === "POST");
  await crop.getByRole("button", { name: "确认并保存" }).click();
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  expect(response.request().headers()["content-type"]).toBe("image/webp");
  const sent = response.request().postDataBuffer()!;
  expect(sent.length).toBeLessThan(2 * 1024 * 1024);
  expect(await sharp(sent).metadata()).toMatchObject({ width: 512, height: 512, format: "webp" });
  await expect(crop).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "头像已更新" })).toBeVisible();
  expect(uploads).toBe(1);
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
