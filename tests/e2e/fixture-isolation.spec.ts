import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { e2eSecret, resetFixtures } from "./helpers";

test("fixture requires marker and cleans only fixture security subjects", async ({ request }) => {
  const db = new PrismaClient();
  const event = await db.securityEvent.create({ data: { kind: "unrelated-real-audit", subjectHash: "unrelated-subject" } });
  const throttle = await db.authThrottle.create({ data: { key: `unrelated-${event.id}`, scope: "unrelated", count: 1, windowStartedAt: new Date() } });
  try {
    expect((await request.post("/api/test/fixtures", { data: {} })).status()).toBe(404);
    await resetFixtures(request);
    expect(await db.securityEvent.findUnique({ where: { id: event.id } })).not.toBeNull();
    expect(await db.authThrottle.findUnique({ where: { key: throttle.key } })).not.toBeNull();
    const [marker] = await db.$queryRaw<{ fingerprint: string }[]>`SELECT fingerprint FROM "E2eDatabaseIdentity" WHERE id = 1`;
    try {
      await db.$executeRaw`UPDATE "E2eDatabaseIdentity" SET fingerprint = 'wrong-marker' WHERE id = 1`;
      expect((await request.post("/api/test/fixtures", { headers: { "x-e2e-secret": e2eSecret }, data: {} })).status()).toBe(404);
      const response = await request.post("/api/auth/request-code", { data: { email: "e2e-a@example.com" }, headers: { "x-forwarded-for": "fixture-marker-test" } });
      expect((await response.json()).testCode).toBeUndefined();
    } finally { await db.$executeRaw`UPDATE "E2eDatabaseIdentity" SET fingerprint = ${marker.fingerprint} WHERE id = 1`; }
  } finally {
    await db.securityEvent.deleteMany({ where: { id: event.id } });
    await db.authThrottle.deleteMany({ where: { key: throttle.key } });
    await db.$disconnect();
  }
});
