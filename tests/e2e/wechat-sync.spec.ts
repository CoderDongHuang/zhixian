import { test, expect } from "@playwright/test";
import { resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("WeChat login, rotation, binding, multi-device sync, idempotency, and unbinding", async ({ request }) => {
  const loginA = await request.post("/api/mini/auth/login", { data: { code: "e2e:wechat-a", deviceId: "device-a" } }); expect(loginA.ok()).toBeTruthy(); const first = await loginA.json();
  const rotatedResponse = await request.post("/api/mini/auth/refresh", { data: { refreshToken: first.refreshToken, deviceId: "device-a" } }); expect(rotatedResponse.ok()).toBeTruthy(); const rotated = await rotatedResponse.json();
  expect(rotated.account).toEqual({ linked: false, email: null });
  expect((await request.post("/api/mini/auth/refresh", { data: { refreshToken: first.refreshToken, deviceId: "device-a" } })).status()).toBe(401);
  expect((await request.post("/api/mini/auth/login", { data: { code: "e2e:wechat-a", deviceId: "device-b" } })).ok()).toBeTruthy();
  const otp = await request.post("/api/auth/request-code", { data: { email: "e2e-b@example.com" } }); const code = (await otp.json()).testCode;
  const bind = await request.post("/api/mini/auth/bind-email", { headers: { Authorization: `Bearer ${rotated.accessToken}` }, data: { email: "e2e-b@example.com", code } }); expect(bind.ok()).toBeTruthy();
  const targetTokensResponse = await request.post("/api/mini/auth/refresh", { data: { refreshToken: rotated.refreshToken, deviceId: "device-a" } }); expect(targetTokensResponse.ok()).toBeTruthy(); const target = await targetTokensResponse.json();
  expect(target.account).toEqual({ linked: true, email: "e2e-b@example.com" });
  const mutation = { deviceId: "device-a", mutations: [{ resource: "bookmark", resourceId: "e2e-feed-ai", value: { bookmarked: true }, changedAt: new Date().toISOString() }] };
  const headers = { Authorization: `Bearer ${target.accessToken}`, "Idempotency-Key": "e2e-request-001" };
  const firstSync = await request.post("/api/mini/sync", { headers, data: mutation }); const replay = await request.post("/api/mini/sync", { headers, data: mutation }); expect(await replay.json()).toEqual(await firstSync.json());
  const wrongDevice = await request.post("/api/mini/sync", { headers: { Authorization: `Bearer ${target.accessToken}`, "Idempotency-Key": "e2e-request-002" }, data: { ...mutation, deviceId: "device-b" } }); expect(wrongDevice.status()).toBe(400);
  expect((await request.delete("/api/mini/auth/bind-email", { headers: { Authorization: `Bearer ${target.accessToken}` } })).ok()).toBeTruthy();
});
