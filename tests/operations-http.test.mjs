import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

test("production operations endpoint rejects anonymous callers and reports unavailable metrics", { timeout: 60000 }, async () => {
  const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`, token = "local-monitor-secret-at-least-24";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production", APP_URL: base, E2E_TEST_MODE: "false", MONITOR_TOKEN: token, DATABASE_URL: "postgresql://test:test@127.0.0.1:9/zhixian_unavailable_test?connect_timeout=1", AUTH_SECRET: "local-auth-secret-at-least-24", EMAIL_API_KEY: "", AI_API_KEY: "", ANALYSIS_AI_API_KEY: "", RESEARCH_AI_API_KEY: "", LEARNING_AI_API_KEY: "", EMBEDDING_API_KEY: "" },
  });
  let startup = "";
  server.stdout.on("data", (data) => { startup += data; }); server.stderr.on("data", (data) => { startup += data; });
  try {
    let anonymous;
    for (let i = 0; i < 60 && server.exitCode === null; i++) {
      try { anonymous = await fetch(`${base}/api/admin/operations`, { signal: AbortSignal.timeout(1000) }); } catch { /* Wait for local production server. */ }
      if (anonymous) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(anonymous, startup); assert.equal(anonymous.status, 403);
    const failed = await fetch(`${base}/api/admin/operations`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { status: "FAILED", reasons: ["METRICS_UNAVAILABLE"] });
  } finally {
    if (server.exitCode === null) { const ended = once(server, "exit"); server.kill(); await ended; }
  }
});
