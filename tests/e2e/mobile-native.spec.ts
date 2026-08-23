import { expect, test } from "@playwright/test";
import { resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("OTP is invalidated after five failed verification attempts", async ({ request }) => {
  const otpResponse = await request.post("/api/auth/request-code", { data: { email: "e2e-a@example.com", deviceId: "otp-lock-test" } });
  expect(otpResponse.ok()).toBeTruthy();
  const { testCode } = await otpResponse.json();
  const wrongCode = testCode === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request.post("/api/mobile/auth/verify-code", { data: { email: "e2e-a@example.com", code: wrongCode, deviceId: "otp-lock-test" } });
    expect(response.status()).toBe(401);
  }
  const locked = await request.post("/api/mobile/auth/verify-code", { data: { email: "e2e-a@example.com", code: testCode, deviceId: "otp-lock-test" } });
  expect(locked.status()).toBe(401);
});

test("native OTP login, token rotation, feed, sync, and Expo push registration", async ({ request }) => {
  const otpResponse = await request.post("/api/auth/request-code", { data: { email: "e2e-a@example.com" } });
  expect(otpResponse.ok()).toBeTruthy();
  const { testCode } = await otpResponse.json();
  const wrongCode = testCode === "000000" ? "111111" : "000000";
  expect((await request.post("/api/mobile/auth/verify-code", { data: { email: "e2e-a@example.com", code: wrongCode, deviceId: "native-device" } })).status()).toBe(401);
  const loginResponse = await request.post("/api/mobile/auth/verify-code", { data: { email: "e2e-a@example.com", code: testCode, deviceId: "native-device" } });
  expect(loginResponse.ok()).toBeTruthy();
  const login = await loginResponse.json();
  expect(login.account).toEqual({ linked: true, email: "e2e-a@example.com" });

  const refreshResponse = await request.post("/api/mini/auth/refresh", { data: { refreshToken: login.refreshToken, deviceId: "native-device" } });
  expect(refreshResponse.ok()).toBeTruthy();
  const tokens = await refreshResponse.json();
  const authorization = { Authorization: `Bearer ${tokens.accessToken}` };
  expect((await request.get("/api/mini/feed", { headers: authorization })).ok()).toBeTruthy();
  const articleResponse = await request.get("/api/mobile/articles/e2e-feed-ai", { headers: authorization });
  expect(articleResponse.ok()).toBeTruthy();
  expect(await articleResponse.json()).toMatchObject({ id: "e2e-feed-ai", eventId: "e2e-event-ai" });
  expect((await request.get("/api/mobile/articles/e2e-feed-ai")).status()).toBe(401);
  expect((await request.post("/api/mobile/telemetry", { headers: authorization, data: { name: "article_open", properties: { topic: "AI" } } })).status()).toBe(204);
  expect((await request.post("/api/mobile/telemetry", { headers: authorization, data: { name: "email_collected" } })).status()).toBe(400);
  expect((await request.post("/api/mobile/feedback", { headers: authorization, data: { rating: 5, message: "RC feedback" } })).ok()).toBeTruthy();
  expect((await request.post("/api/mobile/feedback", { headers: authorization, data: { rating: 9, message: "invalid" } })).status()).toBe(400);

  const mutation = await request.post("/api/mini/sync", { headers: { ...authorization, "Idempotency-Key": "native-sync-001" }, data: { deviceId: "native-device", mutations: [{ resource: "bookmark", resourceId: "e2e-feed-ai", value: { bookmarked: true }, changedAt: new Date().toISOString() }] } });
  expect(mutation.ok()).toBeTruthy();
  expect((await request.post("/api/mobile/push/subscribe", { headers: authorization, data: { token: "invalid", platform: "android" } })).status()).toBe(400);
  expect((await request.post("/api/mobile/push/subscribe", { headers: authorization, data: { token: "ExponentPushToken[e2e-native-device]", platform: "android" } })).ok()).toBeTruthy();
  expect((await request.post("/api/mobile/push/subscribe", { data: { token: "ExponentPushToken[attacker]", platform: "android" } })).status()).toBe(401);
});
