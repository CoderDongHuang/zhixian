import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const database = process.env.DATABASE_URL;
const isolated = database && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname) && /^zhixian_.*(?:test|e2e)$/.test(new URL(database).pathname.slice(1));
test("production HTTP authentication without E2E bypass limits requests and rejects OTP replay", { skip: !isolated, timeout: 60000 }, async () => {
  const db = new PrismaClient();
  const id = randomUUID();
  const email = `real-http-${id}@example.com`;
  const ip = `real-http-ip-${id}`;
  const secret = "http-auth-secret-at-least-24-characters";
  const hash = (value) => createHash("sha256").update(`${secret}:${value}`).digest("hex");
  const user = await db.user.create({ data: { email } });
  const portServer = createServer();
  portServer.listen(0, "127.0.0.1");
  await once(portServer, "listening");
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production", E2E_TEST_MODE: "false", AUTH_SECRET: secret, APP_URL: base, EMAIL_API_KEY: "", EMAIL_FROM: "", RESEARCH_AI_API_KEY: "", LEARNING_AI_API_KEY: "", AI_API_KEY: "", ANALYSIS_AI_API_KEY: "", EMBEDDING_API_KEY: "" },
  });
  let startup = "";
  server.stdout.on("data", (data) => { startup += data.toString(); });
  server.stderr.on("data", (data) => { startup += data.toString(); });
  const post = (path, data) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000) });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && server.exitCode === null; attempt++) {
      try { ready = (await fetch(base + "/api/health", { signal: AbortSignal.timeout(500) })).ok; } catch { /* Server is starting. */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, startup);
    assert.equal((await post("/api/test/fixtures", {})).status, 404);
    const requests = await Promise.all(Array.from({ length: 8 }, () => post("/api/auth/request-code", { email })));
    assert.equal(requests.filter((r) => r.status === 200).length, 1);
    assert.equal(requests.filter((r) => r.status === 429).length, 7);
    for (const response of requests) assert.equal((await response.json()).testCode, undefined);
    const failedDelivery = await db.emailOtp.findFirstOrThrow({ where: { email } });
    assert.ok(failedDelivery.usedAt && failedDelivery.lockedAt);
    assert.equal(await db.securityEvent.count({ where: { kind: "otp_delivery_failed", subjectHash: hash(`security-subject:${email}`) } }), 1);
    await db.emailOtp.create({ data: { email, codeHash: hash("123456"), expiresAt: new Date(Date.now() + 60000) } });
    const verification = await Promise.all(Array.from({ length: 8 }, () => post("/api/auth/verify-code", { email, code: "123456" })));
    assert.equal(verification.filter((r) => r.status === 200).length, 1);
    assert.equal(verification.filter((r) => r.status >= 400 && r.status < 500).length, 7);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
  } finally {
    const ended = once(server, "exit");
    if (server.exitCode === null) { server.kill(); await ended; }
    await db.user.delete({ where: { id: user.id } });
    await db.emailOtp.deleteMany({ where: { email } });
    const scopes = ["otp-request-ip-hour", "otp-request-ip-day", "otp-request-email-minute", "otp-request-email-hour", "otp-request-email-day", "otp-verify-ip", "otp-verify-email"];
    await db.authThrottle.deleteMany({ where: { key: { in: [email, ip].flatMap((subject) => scopes.map((scope) => hash(`auth-throttle:${scope}:${subject}`))) } } });
    await db.securityEvent.deleteMany({ where: { subjectHash: { in: [email, ip].map((subject) => hash(`security-subject:${subject}`)) } } });
    await db.$disconnect();
  }
});
