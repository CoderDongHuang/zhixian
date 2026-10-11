import { test, expect } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });
test("push UI saves, closes and confirms server ownership", async ({ page }) => {
  await page.addInitScript(() => {
    let subscription: object | null = null;
    const manager = {
      getSubscription: async () => subscription,
      subscribe: async () => {
        subscription = {
          endpoint: "https://push.example.com/e2e", unsubscribe: async () => { subscription = null; return true; },
          toJSON: () => ({ endpoint: "https://push.example.com/e2e", keys: { p256dh: "e2e", auth: "e2e" } }),
        };
        return subscription;
      },
    };
    Object.defineProperty(navigator, "serviceWorker", { value: { ready: Promise.resolve({ pushManager: manager }), register: async () => ({}) }, configurable: true });
    Object.defineProperty(window, "PushManager", { value: function () {}, configurable: true });
    Object.defineProperty(window, "Notification", { value: { requestPermission: async () => "granted" }, configurable: true });
  });
  await login(page);
  await page.goto("/");
  await page.getByRole("button", { name: "开启推送", exact: true }).click();
  await expect(page.getByRole("button", { name: "关闭推送", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/push/subscribe?endpoint=https%3A%2F%2Fpush.example.com%2Fe2e")).json()).registered).toBe(true);
  await page.getByRole("button", { name: "关闭推送", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("推送已关闭");
  expect((await (await page.request.get("/api/push/subscribe?endpoint=https%3A%2F%2Fpush.example.com%2Fe2e")).json()).registered).toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "开启推送", exact: true })).toBeEnabled();
});
test("out of order server enable cannot override close", async ({ page }) => {
  await login(page);
  const changedAt = Date.now();
  const endpoint = "https://push.example.com/late-e2e";
  expect((await page.request.delete("/api/push/subscribe", { data: { endpoint, changedAt: changedAt + 1 } })).status()).toBe(200);
  expect((await page.request.post("/api/push/subscribe", { data: { endpoint, changedAt, keys: { p256dh: "e2e", auth: "e2e" } } })).status()).toBe(409);
  expect((await (await page.request.get(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`)).json()).registered).toBe(false);
});

test("browser registration errors remain actionable and never report enabled", async ({ page }) => {
  await page.addInitScript(() => {
    const manager = {
      getSubscription: async () => null,
      subscribe: async () => { throw new DOMException("browser-native-error", localStorage.getItem("e2e-push-error") || "InvalidAccessError"); },
    };
    Object.defineProperty(navigator, "serviceWorker", { value: { ready: Promise.resolve({ pushManager: manager }), register: async () => ({}) }, configurable: true });
    Object.defineProperty(window, "PushManager", { value: function () {}, configurable: true });
    Object.defineProperty(window, "Notification", { value: { requestPermission: async () => "granted" }, configurable: true });
  });
  await login(page);
  let writes = 0;
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/push/subscribe") writes++; });
  for (const [name, message] of [
    ["InvalidAccessError", "推送密钥配置无效，请联系管理员核对"],
    ["InvalidCharacterError", "推送密钥配置无效，请联系管理员核对"],
    ["AbortError", "浏览器推送服务拒绝注册，请稍后重试"],
  ]) {
    await page.goto("/");
    await page.evaluate((value) => localStorage.setItem("e2e-push-error", value), name);
    await page.getByRole("button", { name: "开启推送", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(message);
    await expect(page.getByRole("button", { name: "开启推送", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "关闭推送", exact: true })).toHaveCount(0);
  }
  expect(writes).toBe(0);
});
