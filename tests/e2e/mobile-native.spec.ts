import { expect, test } from "@playwright/test";
import { resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("native OTP login, token rotation, feed, sync, and Expo push registration", async ({ request }) => {
  const otpResponse = await request.post("/api/auth/request-code", { data: { email: "e2e-a@example.com" } });
  expect(otpResponse.ok()).toBeTruthy();
  const { testCode } = await otpResponse.json();
  expect((await request.post("/api/mobile/auth/verify-code", { data: { email: "e2e-a@example.com", code: "000000", deviceId: "native-device" } })).status()).toBe(401);
  const loginResponse = await request.post("/api/mobile/auth/verify-code", { data: { email: "e2e-a@example.com", code: testCode, deviceId: "native-device" } });
  expect(loginResponse.ok()).toBeTruthy();
  const login = await loginResponse.json();
  expect(login.account).toEqual({ linked: true, email: "e2e-a@example.com" });

  const refreshResponse = await request.post("/api/mini/auth/refresh", { data: { refreshToken: login.refreshToken, deviceId: "native-device" } });
  expect(refreshResponse.ok()).toBeTruthy();
  const tokens = await refreshResponse.json();
  const authorization = { Authorization: `Bearer ${tokens.accessToken}` };
  expect((await request.get("/api/mini/feed", { headers: authorization })).ok()).toBeTruthy();

  const mutation = await request.post("/api/mini/sync", { headers: { ...authorization, "Idempotency-Key": "native-sync-001" }, data: { deviceId: "native-device", mutations: [{ resource: "bookmark", resourceId: "e2e-feed-ai", value: { bookmarked: true }, changedAt: new Date().toISOString() }] } });
  expect(mutation.ok()).toBeTruthy();
  expect((await request.post("/api/mobile/push/subscribe", { headers: authorization, data: { token: "invalid", platform: "android" } })).status()).toBe(400);
  expect((await request.post("/api/mobile/push/subscribe", { headers: authorization, data: { token: "ExponentPushToken[e2e-native-device]", platform: "android" } })).ok()).toBeTruthy();
  expect((await request.post("/api/mobile/push/subscribe", { data: { token: "ExponentPushToken[attacker]", platform: "android" } })).status()).toBe(401);
});
