import { test, expect } from "@playwright/test";
import { resetFixtures } from "./helpers";
import { PrismaClient } from "@prisma/client";

test("all authentication routes reject malformed types, lengths and JSON without writes", async ({ request }) => {
  await resetFixtures(request);
  const login = await request.post("/api/mini/auth/login", { data: { code: "e2e:input", deviceId: "input-test" } });
  expect(login.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await login.json()).accessToken}`, "Content-Type": "application/json" };
  const db = new PrismaClient();
  try {
    const before = await Promise.all([db.emailOtp.count(), db.user.count(), db.session.count(), db.miniSession.count()]);
    for (const [url, valid] of [
      ["/api/auth/request-code", { email: "e2e-a@example.com", deviceId: "test" }],
      ["/api/auth/verify-code", { email: "e2e-a@example.com", code: "123456", inviteCode: "" }],
      ["/api/mobile/auth/verify-code", { email: "e2e-a@example.com", code: "123456", deviceId: "test" }],
      ["/api/mini/auth/bind-email", { email: "e2e-a@example.com", code: "123456" }],
      ["/api/mini/auth/login", { code: "e2e:valid", deviceId: "test" }],
      ["/api/mini/auth/refresh", { refreshToken: "test-token", deviceId: "test" }],
    ] as const) {
      for (const field of Object.keys(valid)) {
        for (const invalid of [{}, [], 123456, null, "x".repeat(513)]) {
          expect((await request.post(url, { headers, data: { ...valid, [field]: invalid } })).status(), `${url} ${field} ${typeof invalid}`).toBe(400);
        }
      }
      for (const data of ["{broken", "null", "[]", '"text"', JSON.stringify({ ...valid, padding: "x".repeat(9000) })]) {
        expect((await request.post(url, { headers, data })).status(), `${url}: malformed body`).toBe(400);
      }
    }
    expect(await Promise.all([db.emailOtp.count(), db.user.count(), db.session.count(), db.miniSession.count()])).toEqual(before);
  } finally { await db.$disconnect(); }
});
