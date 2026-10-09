import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { claimTask, runTask, finishTask, assertTaskLease, taskKey, replayTarget, requireReplaySelection } from "../lib/pipeline-tasks.mjs";
import { evaluateOperations, monitorAuthorized, operationalMetrics } from "../lib/operations.mjs";
import { usageCost, trackedAiFetch } from "../lib/ai-telemetry.mjs";

const now = new Date("2026-10-09T00:00:00Z");
const fresh = () => ({ sources: [{ id: "source", lastFetchedAt: now }], latestPublishedAt: now, backlog: { pending: 0, failed: 0, oldestAt: null }, attempts: 5, failedAttempts: 0, failedTasks: 0, expiredTasks: 0, waitingTasks: 0, notificationFailures: 0, unknownCostCalls: 0 });
const run = (script, args = [], env = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [`scripts/${script}.mjs`, ...args], { env: { ...process.env, ...env } });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  child.once("error", reject); child.once("exit", (code) => resolve({ code, output }));
});

test("data-health monitor distinguishes active, paused, unknown and failures", () => {
  assert.equal(evaluateOperations(fresh(), { CONTENT_PIPELINE_STATE: "active" }, now).status, "SUCCEEDED");
  const stale = { ...fresh(), sources: [{ id: "stale", lastFetchedAt: "2020-01-01" }], latestPublishedAt: null };
  assert.deepEqual(evaluateOperations(stale, { CONTENT_PIPELINE_STATE: "active" }, now).reasons, ["SOURCE_STALE", "PUBLICATION_STALE"]);
  assert.equal(evaluateOperations(stale, { CONTENT_PIPELINE_STATE: "paused" }, now).status, "PAUSED");
  assert.equal(evaluateOperations(fresh(), {}, now).status, "WARNING");
  for (const field of ["failedTasks", "expiredTasks", "waitingTasks", "notificationFailures", "unknownCostCalls", "aiFailures"]) {
    assert.equal(evaluateOperations({ ...fresh(), [field]: 1 }, { CONTENT_PIPELINE_STATE: "paused" }, now).status, "WARNING", field);
  }
  const backlog = { ...fresh(), analysisBacklog: { oldestAt: "2020-01-01" }, trendSources: [{ lastFetchedAt: null }] };
  assert.deepEqual(evaluateOperations(backlog, { CONTENT_PIPELINE_STATE: "active" }, now).reasons, ["ANALYSIS_BACKLOG_STALE", "TREND_SOURCE_STALE"]);
  assert.deepEqual(evaluateOperations({ ...fresh(), sources: [{ id: "invalid", lastFetchedAt: "invalid" }] }, { CONTENT_PIPELINE_STATE: "active" }, now).staleSources, ["invalid"]);
});

test("monitor authentication fails closed", () => {
  const token = "local-monitor-secret-at-least-24";
  assert.equal(monitorAuthorized(`Bearer ${token}`, token), true);
  for (const value of [null, "", "Bearer wrong", `Basic ${token}`]) assert.equal(monitorAuthorized(value, token), false);
  assert.equal(monitorAuthorized("Bearer short", "short"), false);
});

test("AI cost only uses returned usage and versioned explicit pricing", () => {
  const env = { AI_PRICING_JSON: JSON.stringify({ "example.com/model": { version: "2026-10", inputPerMillion: 2, outputPerMillion: 4 } }) };
  assert.deepEqual(usageCost({ prompt_tokens: 100, completion_tokens: 50 }, "model", "example.com", env), { inputTokens: 100, outputTokens: 50, costUsd: 0.0004, pricingVersion: "2026-10" });
  for (const usage of [undefined, {}, { prompt_tokens: -1, completion_tokens: 1 }, { prompt_tokens: 1e20, completion_tokens: 1 }]) assert.equal(usageCost(usage, "model", "example.com", env).costUsd, null);
  assert.equal(usageCost({ prompt_tokens: 1, completion_tokens: 1 }, "model", "example.com", {}).costUsd, null);
});

test("monitor CLI really exits unsuccessfully on stale or unconfirmed operations", async () => {
  let status = "SUCCEEDED", seenAuth;
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/admin/operations") { seenAuth = req.headers.authorization; res.end(JSON.stringify({ status, reasons: status === "WARNING" ? ["SOURCE_STALE"] : [] })); }
    else res.end(JSON.stringify({ database: "ok" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const env = { MONITOR_URL: `http://127.0.0.1:${server.address().port}`, MONITOR_TOKEN: "test-monitor-token-at-least-24" };
  try {
    for (const value of ["SUCCEEDED", "PAUSED", "WARNING", "UNKNOWN"]) {
      status = value;
      const result = await run("monitor-production", [], env);
      assert.equal(result.code, ["SUCCEEDED", "PAUSED"].includes(value) ? 0 : 1, result.output);
      assert.equal(seenAuth, `Bearer ${env.MONITOR_TOKEN}`);
      assert.equal(result.output.includes(env.MONITOR_TOKEN), false);
    }
    assert.equal((await run("monitor-production", [], { ...env, MONITOR_TOKEN: "" })).code, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

const database = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const isolated = database && ["127.0.0.1", "localhost"].includes(database.hostname) && /^zhixian_.*(?:test|e2e)$/.test(database.pathname.slice(1));
test("real PostgreSQL task leases, replay, telemetry and metrics", { skip: !isolated }, async (t) => {
  const db = new PrismaClient();
  const prefix = `operations-${randomUUID()}`;
  const identity = (suffix = "one") => ({ name: "test", resourceId: `${prefix}-${suffix}`, revision: 1 });
  const savedReplay = process.env.PIPELINE_REPLAY_TASK;
  const ownedTaskIds = [];
  let mockBody = { usage: { prompt_tokens: 100, completion_tokens: 50 }, choices: [] }, responseStatus = 200;
  const server = createServer((req, res) => { res.writeHead(responseStatus, { "Content-Type": "application/json" }); res.end(typeof mockBody === "string" ? mockBody : JSON.stringify(mockBody)); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const provider = `127.0.0.1:${server.address().port}`, url = `http://${provider}/?key=never-store-this`;
  try {
    delete process.env.PIPELINE_REPLAY_TASK;
    await t.test("twenty concurrent workers claim exactly one lease", async () => {
      const claims = await Promise.all(Array.from({ length: 20 }, () => claimTask(db, identity())));
      assert.equal(claims.filter(Boolean).length, 1);
      await finishTask(claims.find(Boolean), "SUCCEEDED");
      assert.equal(await claimTask(db, { ...identity(), replay: true }), null);
      assert.equal(await db.pipelineAttempt.count({ where: { taskId: claims.find(Boolean).taskId } }), 1);
    });
    await t.test("reclaimed lease prevents stale writes and completion", async () => {
      const old = await claimTask(db, identity("expired"));
      await db.pipelineTask.update({ where: { id: old.taskId }, data: { leaseUntil: new Date(0) } });
      const current = await claimTask(db, identity("expired"));
      assert.notEqual(current.token, old.token);
      await assert.rejects(db.$transaction((tx) => assertTaskLease(tx, old)), /TASK_LEASE_LOST/);
      await assert.rejects(finishTask(old, "SUCCEEDED"), /TASK_LEASE_LOST/);
      await finishTask(current, "SUCCEEDED");
      assert.equal((await db.pipelineAttempt.findUniqueOrThrow({ where: { id: old.attemptId } })).status, "EXPIRED");
    });
    await t.test("failure backoff, retry cap and explicit replay", async () => {
      const item = identity("retry");
      let claim = await claimTask(db, item); await finishTask(claim, "FAILED");
      assert.equal(await claimTask(db, item), null);
      for (let attempt = 0; attempt < 2; attempt++) {
        await db.pipelineTask.update({ where: { id: claim.taskId }, data: { retryAt: new Date(0) } });
        claim = await claimTask(db, item); await finishTask(claim, "FAILED");
      }
      await db.pipelineTask.update({ where: { id: claim.taskId }, data: { retryAt: new Date(0) } });
      assert.equal(await claimTask(db, item), null);
      process.env.PIPELINE_REPLAY_TASK = claim.taskId;
      assert.equal((await replayTarget(db, "test")).id, claim.taskId);
      await assert.rejects(runTask(db, identity("wrong"), async () => true), /REPLAY_TARGET_MISMATCH/);
      assert.throws(() => requireReplaySelection({ id: claim.taskId }, []), /REPLAY_RESOURCE_UNAVAILABLE/);
      await runTask(db, item, async () => true);
      assert.equal((await db.pipelineTask.findUniqueOrThrow({ where: { id: claim.taskId } })).status, "SUCCEEDED");
      await assert.rejects(replayTarget(db, "test"), /Replay requires/);
      delete process.env.PIPELINE_REPLAY_TASK;
    });
    await t.test("heartbeat keeps a slow worker lease alive", async () => {
      const result = await runTask(db, { ...identity("heartbeat"), leaseMs: 1500 }, async () => { await new Promise((resolve) => setTimeout(resolve, 1800)); return true; });
      assert.equal(result.skipped, false);
    });
    await t.test("AI HTTP usage, unknown costs and failures are persisted without prompts or keys", async () => {
      const env = { AI_PRICING_JSON: JSON.stringify({ [`${provider}/test-model`]: { version: "v1", inputPerMillion: 2, outputPerMillion: 4 } }) };
      const call = trackedAiFetch(db, prefix, "test-model", fetch, env);
      await runTask(db, identity("ai"), async () => { const response = await call(url, { method: "POST", body: "private-prompt" }); assert.equal(response.ok, true); return true; });
      let row = await db.aiCall.findFirstOrThrow({ where: { scope: prefix }, orderBy: { createdAt: "desc" } });
      assert.equal(row.costUsd, 0.0004); assert.ok(row.attemptId); assert.equal(row.provider, provider);
      assert.equal(JSON.stringify(row).includes("private-prompt"), false); assert.equal(JSON.stringify(row).includes("never-store-this"), false);
      mockBody = { data: [{ embedding: [0.1] }], usage: { total_tokens: 5 } }; await call(url);
      row = await db.aiCall.findFirstOrThrow({ where: { scope: prefix }, orderBy: { createdAt: "desc" } });
      assert.equal(row.inputTokens, 5); assert.equal(row.outputTokens, 0);
      mockBody = "malformed"; await call(url);
      row = await db.aiCall.findFirstOrThrow({ where: { scope: prefix }, orderBy: { createdAt: "desc" } });
      assert.equal(row.status, "INVALID_RESPONSE"); assert.equal(row.costUsd, null);
      responseStatus = 503; await call(url);
      await assert.rejects(trackedAiFetch(db, prefix, "test-model", async () => { throw new Error("network"); })(url), /network/);
      assert.equal(await db.aiCall.count({ where: { scope: prefix, status: { in: ["HTTP_FAILED", "NETWORK_FAILED"] } } }), 2);
    });
    await t.test("actual processing failure replay via CLI and default dry run", async () => {
      const source = await db.source.create({ data: { id: prefix, name: prefix, url: `https://example.com/${prefix}`, type: "OFFICIAL_BLOG", language: "ZH" } });
      const doc = await db.rawDocument.create({ data: { id: prefix, sourceId: source.id, title: `${prefix} 原文测试研究任务重新处理`, url: `https://example.com/${prefix}/doc`, content: "中文原文材料，验证失败的任务能够正确重新处理。", language: "ZH", processingStatus: "FAILED", contentHash: prefix } });
      const claim = await claimTask(db, { name: "content-process", resourceId: doc.id, revision: doc.materialRevision });
      await finishTask(claim, "FAILED");
      let result = await run("replay-pipeline-task", [claim.taskId], { AI_API_KEY: "" }); assert.equal(result.code, 0, result.output);
      assert.equal((await db.rawDocument.findUniqueOrThrow({ where: { id: doc.id } })).processingStatus, "FAILED");
      result = await run("replay-pipeline-task", [claim.taskId, "--execute"], { AI_API_KEY: "" }); assert.equal(result.code, 0, result.output);
      assert.equal((await db.rawDocument.findUniqueOrThrow({ where: { id: doc.id } })).processingStatus, "PROCESSED");
      assert.equal((await db.pipelineTask.findUniqueOrThrow({ where: { id: claim.taskId } })).status, "SUCCEEDED");
      const missing = await claimTask(db, { name: "content-process", resourceId: `${prefix}-missing`, revision: 0 }); await finishTask(missing, "FAILED");
      result = await run("replay-pipeline-task", [missing.taskId, "--execute"], { AI_API_KEY: "" }); assert.equal(result.code, 1, result.output); assert.match(result.output, /REPLAY_RESOURCE_UNAVAILABLE/);
    });
    await t.test("metrics query reads real task, cost, source and analysis backlog", async () => {
      const metrics = await operationalMetrics(db);
      assert.ok(metrics.totalCalls >= 5); assert.ok(metrics.aiFailures >= 3); assert.ok(metrics.failedTasks >= 1);
      assert.ok(metrics.sources.some((item) => item.id === prefix)); assert.ok(metrics.analysisBacklog.pending >= 1);
      assert.ok(metrics.recentTasks.some((item) => item.resourceId === `${prefix}-missing`));
    });
    await t.test("trend snapshot bridge and per-metric forecast execute through replay without external APIs", async () => {
      const source = await db.source.create({ data: { id: `${prefix}-github`, name: prefix, url: "https://api.github.com/test", type: "GITHUB_API", language: "EN" } });
      const row = await db.sourceSnapshot.create({ data: { id: `${prefix}-snapshot`, sourceId: source.id, url: `https://github.com/${prefix}/repo`, title: prefix, contentHash: prefix, content: "", metrics: { stars: 100, forks: 10 } } });
      const claim = await claimTask(db, { name: "trend-bridge", resourceId: row.id, revision: "test-poll" }); await finishTask(claim, "FAILED");
      const env = { GITHUB_TREND_REPOS: "", TREND_PAPER_TOPICS_JSON: "[]", TREND_FEEDS_JSON: "[]", GITHUB_TOKEN: "" };
      const result = await run("replay-pipeline-task", [claim.taskId, "--execute"], env); assert.equal(result.code, 0, result.output);
      const subject = await db.trendSubject.findUniqueOrThrow({ where: { slug: `github-${prefix}-repo` } });
      assert.equal(await db.trendSnapshot.count({ where: { subjectId: subject.id } }), 1);
      await db.trendSnapshot.createMany({ data: Array.from({ length: 6 }, (_, i) => ({ subjectId: subject.id, observedAt: new Date(row.fetchedAt.getTime() - (i + 1) * 86400000), sourceFetchedAt: row.fetchedAt, sourceUrl: row.url, metrics: { stars: 99 - i }, windowDays: 30 })) });
      const snapshots = await db.trendSnapshot.findMany({ where: { subjectId: subject.id }, orderBy: { observedAt: "desc" }, take: 365 });
      const revision = createHash("sha256").update(JSON.stringify(snapshots.map((item) => [item.id, item.observedAt, item.metrics, item.windowDays, item.methodologyVersion]))).digest("hex");
      const forecast = await claimTask(db, { name: "trend-forecast", resourceId: `${subject.id}:stars`, revision }); await finishTask(forecast, "FAILED");
      ownedTaskIds.push(forecast.taskId);
      const generated = await run("replay-pipeline-task", [forecast.taskId, "--execute"], env); assert.equal(generated.code, 0, generated.output);
      assert.equal(await db.trendForecast.count({ where: { subjectId: subject.id, metricKey: "stars" } }), 1);
      await db.pipelineTask.delete({ where: { id: forecast.taskId } });
      await db.trendSubject.delete({ where: { id: subject.id } });
    });
    assert.equal(taskKey("a", "b", 1), taskKey("a", "b", "1"));
  } finally {
    if (savedReplay === undefined) delete process.env.PIPELINE_REPLAY_TASK; else process.env.PIPELINE_REPLAY_TASK = savedReplay;
    await new Promise((resolve) => server.close(resolve));
    await db.aiCall.deleteMany({ where: { scope: prefix } });
    await db.pipelineTask.deleteMany({ where: { OR: [{ resourceId: { startsWith: prefix } }, { id: { in: ownedTaskIds } }] } });
    await db.trendSubject.deleteMany({ where: { slug: { startsWith: `github-${prefix}` } } });
    const relations = await db.eventDocument.findMany({ where: { documentId: prefix }, select: { eventId: true } });
    await db.rawDocument.deleteMany({ where: { id: prefix } });
    await db.sourceSnapshot.deleteMany({ where: { sourceId: `${prefix}-github` } });
    await db.source.deleteMany({ where: { id: `${prefix}-github` } });
    await db.source.deleteMany({ where: { id: prefix } });
    await db.event.deleteMany({ where: { id: { in: relations.map((row) => row.eventId) } } });
    await db.$disconnect();
  }
});
