import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";

test("HTTP auth rejects invitation substitution and concurrent OTP replay", async ({ request }) => {
  const url = process.env.DATABASE_URL;
  if (!url || !/^zhixian_.*(?:test|e2e)$/.test(new URL(url).pathname.slice(1))) throw new Error("Dedicated test database required");
  const db = new PrismaClient();
  const prefix = `e2e-claim-${randomUUID()}`;
  const email = `${prefix}@example.com`;
  try {
    await db.invitation.createMany({ data: [{ code: `${prefix}-open` }, { code: `${prefix}-bound`, email: `other-${email}` }] });
    const sent = await request.post("/api/auth/request-code", { data: { email, inviteCode: `${prefix}-open` } });
    expect(sent.status()).toBe(200);
    const { testCode: code } = await sent.json();
    expect(code).toMatch(/^\d{6}$/);
    expect((await request.post("/api/auth/verify-code", { data: { email, code, inviteCode: `${prefix}-bound` } })).status()).toBe(401);
    expect(await db.user.count({ where: { email } })).toBe(0);
    const results = await Promise.all([0, 1].map(() => request.post("/api/auth/verify-code", { data: { email, code, inviteCode: `${prefix}-open` } })));
    expect(results.map((r) => r.status()).sort()).toEqual([200, 401]);
    expect(await db.session.count({ where: { user: { email } } })).toBe(1);
    const mobileSent = await request.post("/api/auth/request-code", { data: { email, deviceId: prefix } });
    const mobileCode = (await mobileSent.json()).testCode;
    expect(mobileCode).toMatch(/^\d{6}$/);
    const mobile = await Promise.all([0, 1].map(() => request.post("/api/mobile/auth/verify-code", { data: { email, code: mobileCode, deviceId: prefix } })));
    expect(mobile.map((r) => r.status()).sort()).toEqual([200, 401]);
  } finally {
    await db.user.deleteMany({ where: { email } });
    await db.emailOtp.deleteMany({ where: { email } });
    await db.invitation.deleteMany({ where: { code: { startsWith: prefix } } });
    await db.$disconnect();
  }
});
