import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { budgetPolicy, boundedAiRequest, usdMicros, aiBudgetMetrics, reserveAiBudget } from "../lib/ai-budget.mjs";
import { trackedAiFetch } from "../lib/ai-telemetry.mjs";
import { evaluateOperations } from "../lib/operations.mjs";

const config = { dailyLimitUsd: "0.30", reservationUsd: "0.10", maxCallsPerDay: 100, maxInputBytes: 10000, maxOutputTokens: 100 };
const envFor = (overrides = {}) => ({ AI_BUDGET_ENFORCE: "true", AI_BUDGET_JSON: JSON.stringify({ ...config, ...overrides }) });
const body = { method: "POST", body: JSON.stringify({ model: "test", messages: [{ role: "user", content: "private-prompt" }] }) };

test("budget configuration and money fail closed without guessing a spending limit", () => {
  assert.equal(budgetPolicy({}), null);
  assert.equal(usdMicros("0.000001"), 1n);
  assert.equal(usdMicros("2.01"), 2010000n);
  for (const value of [1, "-1", "1e3", "NaN", "0.0000001", " 1", "01", "Infinity"]) assert.throws(() => usdMicros(value));
  for (const env of [{ AI_BUDGET_ENFORCE: "true" }, { AI_BUDGET_ENFORCE: "no" }, { AI_BUDGET_JSON: "null" }, { AI_BUDGET_JSON: "7" }, { AI_BUDGET_JSON: "{" }, envFor({ dailyLimitUsd: "0.01" }), envFor({ reservationUsd: "0" }), envFor({ maxCallsPerDay: 0 }), envFor({ extra: true }), envFor({ maxOutputTokens: 1.5 })]) assert.throws(() => budgetPolicy(env));
});

test("budget request bounds output, UTF-8 bytes, streams, model and redirects", () => {
  const policy = budgetPolicy(envFor());
  const request = boundedAiRequest(body, "test", policy);
  assert.equal(JSON.parse(request.body).max_tokens, 100);
  assert.equal(request.redirect, "error");
  const unicodeRequest = { ...body, body: JSON.stringify({ model: "test", messages: [{ role: "user", content: "中文🙂" }] }) };
  const finalBytes = Buffer.byteLength(boundedAiRequest(unicodeRequest, "test", policy).body, "utf8");
  assert.throws(() => boundedAiRequest(unicodeRequest, "test", { ...policy, maxInputBytes: finalBytes - 1 }), /AI_BUDGET_INVALID_REQUEST/);
  assert.equal(Buffer.byteLength(boundedAiRequest(unicodeRequest, "test", { ...policy, maxInputBytes: finalBytes }).body, "utf8"), finalBytes);
  for (const extra of [{ max_tokens: 101 }, { max_completion_tokens: -1 }, { stream: true }, { n: 2 }, { model: "other" }]) assert.throws(() => boundedAiRequest({ ...body, body: JSON.stringify({ ...JSON.parse(body.body), ...extra }) }, "test", policy));
  assert.throws(() => boundedAiRequest({ ...body, body: "{" }, "test", policy));
  assert.throws(() => boundedAiRequest(body, "test", { ...policy, maxInputBytes: 10 }));
  assert.equal(boundedAiRequest({ ...body, body: JSON.stringify({ model: "test", input: ["text"] }) }, "test", policy).method, "POST");
  for (const input of [null, 5, [], [1], ""]) assert.throws(() => boundedAiRequest({ ...body, body: JSON.stringify({ model: "test", input }) }, "test", policy));
});

const url = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const isolated = url && ["localhost", "127.0.0.1"].includes(url.hostname) && /^zhixian_.*(?:test|e2e)$/.test(url.pathname.slice(1));
if (process.env.CI === "true") assert.ok(isolated, "CI must run budget integration tests against an isolated PostgreSQL database");
test("real PostgreSQL and HTTP budget admission, settlement and failure isolation", { skip: !isolated }, async (t) => {
  const db = new PrismaClient(), second = new PrismaClient();
  const prefix = `budget-${randomUUID()}`;
  let requests = 0, delayed = false, payload = { usage: { prompt_tokens: 50, completion_tokens: 50 } };
  const server = createServer(async (req, res) => {
    requests++;
    let received = ""; for await (const chunk of req) received += chunk;
    assert.equal(JSON.parse(received).max_tokens, 100);
    if (delayed) await new Promise((resolve) => setTimeout(resolve, 400));
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const provider = `127.0.0.1:${server.address().port}`, endpoint = `http://${provider}/?key=do-not-store`;
  const env = { ...envFor(), AI_PRICING_JSON: JSON.stringify({ [`${provider}/test`]: { version: "test-v1", inputPerMillion: 1000, outputPerMillion: 1000 } }) };
  const clean = () => db.aiBudgetReservation.deleteMany({ where: { scope: prefix } });
  const call = (client = db, options = env, transport = fetch) => trackedAiFetch(client, prefix, "test", transport, options)(endpoint, body);
  try {
    // This test only runs in an isolated test database; refuse to erase another ledger.
    assert.equal(await db.aiBudgetReservation.count(), 0, "budget test requires a clean dedicated ledger");
    await t.test("two clients and twenty concurrent HTTP requests admit exactly three", async () => {
      delayed = true;
      const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => call(i % 2 ? second : db)));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
      assert.equal(requests, 3);
      assert.equal(await db.aiBudgetReservation.count({ where: { scope: prefix } }), 3);
      assert.equal((await db.aiBudgetReservation.aggregate({ where: { scope: prefix }, _sum: { chargedMicros: true } }))._sum.chargedMicros, 300000n);
      const before = requests; await assert.rejects(call(), /AI_BUDGET_EXHAUSTED/); assert.equal(requests, before);
      const metrics = await aiBudgetMetrics(db, env); assert.equal(metrics.state, "EXHAUSTED");
      assert.doesNotThrow(() => JSON.stringify(metrics));
      await clean(); delayed = false;
    });
    await t.test("known lower cost releases unused reservation but does not reset request count", async () => {
      payload = { usage: { prompt_tokens: 10, completion_tokens: 10 } };
      const options = { ...env, ...envFor({ maxCallsPerDay: 2 }) };
      await call(db, options); await call(db, options);
      assert.equal((await db.aiBudgetReservation.aggregate({ where: { scope: prefix }, _sum: { chargedMicros: true } }))._sum.chargedMicros, 40000n);
      await assert.rejects(call(db, options), /AI_BUDGET_CALL_LIMIT/);
      await db.aiCall.deleteMany({ where: { scope: prefix } });
      await assert.rejects(call(db, options), /AI_BUDGET_CALL_LIMIT/);
      await clean();
    });
    await t.test("missing config, prices or invalid request makes no supplier request", async () => {
      const before = requests;
      await assert.rejects(call(db, { AI_BUDGET_ENFORCE: "true" }), /CONFIG_REQUIRED/);
      await assert.rejects(call(db, envFor()), /PRICE_REQUIRED/);
      await assert.rejects(call(db, { ...env, AI_BUDGET_JSON: "{}" }), /INVALID_CONFIG/);
      // Raw JSON fits, but the injected max_tokens field exceeds the limit.
      await assert.rejects(call(db, { ...env, ...envFor({ maxInputBytes: Buffer.byteLength(body.body, "utf8") }) }), /INVALID_REQUEST/);
      assert.equal(requests, before);
      assert.equal(await db.aiBudgetReservation.count({ where: { scope: prefix } }), 0);
      assert.equal(await db.aiCall.count({ where: { scope: prefix } }), 0);
    });
    await t.test("unknown usage, network failure and excess cost hold funds and stop later calls", async () => {
      for (const scenario of ["unknown", "network", "excess"]) {
        payload = scenario === "excess" ? { usage: { prompt_tokens: 500, completion_tokens: 50 } } : {};
        const transport = scenario === "network" ? async () => { throw new Error("network-error"); } : fetch;
        if (scenario === "network") await assert.rejects(call(db, env, transport), /network-error/); else await call();
        const row = await db.aiBudgetReservation.findFirstOrThrow({ where: { scope: prefix } });
        assert.equal(row.status, scenario === "excess" ? "OVER_LIMIT" : "UNCERTAIN");
        assert.ok(row.chargedMicros >= row.reservedMicros);
        await assert.rejects(call(), /AI_BUDGET_UNCERTAIN/);
        await clean();
      }
    });
    await t.test("crashed or failed settlement cannot release funds; stale reservations require review", async () => {
      const reservation = await reserveAiBudget(db, budgetPolicy(env), { scope: prefix, provider, model: "test" });
      await db.aiBudgetReservation.update({ where: { id: reservation.id }, data: { createdAt: new Date(Date.now() - 600000) } });
      await assert.rejects(call(), /AI_BUDGET_UNCERTAIN/);
      assert.equal((await aiBudgetMetrics(db, env)).stale, 1);
      await clean();
      const broken = { ...db, $transaction: async (work, options) => options ? db.$transaction(work, options) : Promise.reject(new Error("record-unavailable")) };
      payload = { usage: { prompt_tokens: 10, completion_tokens: 10 } };
      await assert.rejects(call(broken), /record-unavailable/);
      const row = await db.aiBudgetReservation.findFirstOrThrow({ where: { scope: prefix } }); assert.equal(row.status, "RESERVED"); assert.equal(row.chargedMicros, 100000n);
      await clean();
    });
    await t.test("unresolved previous-day charges do not disappear at midnight", async () => {
      const day = "2000-01-01";
      await db.aiBudgetDay.upsert({ where: { day }, create: { day }, update: {} });
      await db.aiBudgetReservation.create({ data: { day, scope: prefix, model: "test", provider, reservedMicros: 100000n, chargedMicros: 100000n, status: "UNCERTAIN" } });
      const before = requests;
      await assert.rejects(call(), /AI_BUDGET_UNCERTAIN/);
      assert.equal(requests, before);
      assert.equal((await aiBudgetMetrics(db, env)).unresolved, 1);
      assert.equal((await aiBudgetMetrics(db, env)).state, "UNCERTAIN");
      await clean();
    });
    await t.test("budget warning participates in operational monitor without secrets", async () => {
      const metrics = { sources: [], latestPublishedAt: null, backlog: {}, aiBudget: { state: "UNCERTAIN" } };
      assert.ok(evaluateOperations(metrics, { CONTENT_PIPELINE_STATE: "paused" }).reasons.includes("AI_BUDGET_UNCERTAIN"));
      const rows = await db.aiCall.findMany({ where: { scope: prefix } });
      assert.equal(JSON.stringify(rows).includes("private-prompt"), false); assert.equal(JSON.stringify(rows).includes("do-not-store"), false);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await clean(); await db.aiCall.deleteMany({ where: { scope: prefix } });
    await db.$disconnect(); await second.$disconnect();
  }
});
