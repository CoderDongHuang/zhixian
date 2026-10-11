import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { parseAiBill, reconcileAiBill, microsUsd, safeRequestId } from "../lib/ai-reconciliation.mjs";
import { trackedAiFetch } from "../lib/ai-telemetry.mjs";

const format = (extra = {}) => ({ version: 1, currency: "USD", provider: "example.com", periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z", entries: [{ requestId: "req-one", model: "test", billedUsd: "0.0004" }], ...extra });
const parse = (extra) => parseAiBill(JSON.stringify(format(extra)));
const localCall = (extra = {}) => ({ provider: "example.com", providerRequestId: "req-one", model: "test", createdAt: new Date("2026-10-10T00:00:00Z"), status: "HTTP_SUCCEEDED", costUsd: 0.0004, pricingVersion: "v1", ...extra });

test("normalized invoice requires strict UTC, USD, bounded decimal amounts and exact fields", () => {
  assert.equal(parse().entries[0].billedMicros, 400n);
  for (const extra of [{ version: 2 }, { currency: "CNY" }, { unknown: true }, { provider: "example.com/path?secret=x" }, { periodStart: "2026-02-30T00:00:00Z" }, { periodEnd: "2026-10-01T00:00:00Z" }, { periodStart: "2026-10-01T08:00:00+08:00" }, { entries: [{ requestId: "r", model: "test", billedUsd: -1 }] }, { entries: [{ requestId: "r", model: "test", billedUsd: "-1" }] }, { entries: [{ requestId: "r", model: "test", billedUsd: "0.0000001" }] }, { entries: [{ requestId: "r", model: "test", billedUsd: "1", prompt: "private" }] }]) assert.throws(() => parse(extra));
  assert.throws(() => parseAiBill("{"));
  assert.throws(() => parse({ entries: Array(50001).fill(format().entries[0]) }));
  assert.throws(() => parseAiBill(" ".repeat(5 * 1024 * 1024 + 1)));
});

test("exact IDs and model match; decimal totals serialize without float drift", () => {
  const report = reconcileAiBill(parse(), [localCall()]);
  assert.equal(report.status, "MATCHED"); assert.equal(report.counts.matched, 1);
  assert.equal(report.billedUsd, "0.000400"); assert.equal(report.comparableDeltaUsd, "0.000000");
  assert.equal(microsUsd(-1n), "-0.000001"); assert.equal(microsUsd(1234567890123n), "1234567.890123");
  assert.doesNotThrow(() => JSON.stringify(report));
});

test("missing usage/pricing and differing bills are review items, never zero-cost matches", () => {
  for (const extra of [{ costUsd: null }, { costUsd: Infinity }, { pricingVersion: null }, { costUsd: -1 }]) {
    const report = reconcileAiBill(parse(), [localCall(extra)]);
    assert.equal(report.status, "REVIEW_REQUIRED"); assert.equal(report.counts.unknownCosts, 1);
    assert.equal(report.comparableBilledUsd, "0.000000");
  }
  const report = reconcileAiBill(parse(), [localCall({ costUsd: 0.0003 })]);
  assert.equal(report.counts.differences, 1); assert.equal(report.comparableDeltaUsd, "0.000100");
});

test("duplicate local or invoice IDs never choose an arbitrary candidate or double-match", () => {
  const duplicateLocal = reconcileAiBill(parse(), [localCall(), localCall()]);
  assert.equal(duplicateLocal.counts.duplicateLocalIds, 1); assert.equal(duplicateLocal.counts.matched, 0);
  const duplicateBill = reconcileAiBill(parse({ entries: [format().entries[0], format().entries[0]] }), [localCall()]);
  assert.equal(duplicateBill.counts.duplicateBillIds, 1); assert.equal(duplicateBill.counts.matched, 0);
  assert.equal(duplicateBill.status, "REVIEW_REQUIRED");
});

test("missing IDs, unmatched invoices, failed transport and model conflicts are explicit", () => {
  assert.equal(reconcileAiBill(parse(), [localCall({ providerRequestId: null })]).counts.missingRequestIds, 1);
  assert.equal(reconcileAiBill(parse(), [localCall({ providerRequestId: "other" })]).counts.unmatchedBill, 1);
  assert.equal(reconcileAiBill(parse(), [localCall({ status: "HTTP_FAILED" })]).status, "REVIEW_REQUIRED");
  assert.equal(reconcileAiBill(parse(), [localCall({ model: "other" })]).counts.modelConflicts, 1);
  for (const value of ["id?token=secret", "id\nsecret", "a".repeat(201), 123, undefined]) assert.equal(safeRequestId(value), null);
  const report = reconcileAiBill(parse(), [localCall({ providerRequestId: "secret-private-id" })]);
  assert.equal(JSON.stringify(report).includes("secret-private-id"), false);
});

test("provider and half-open UTC period isolate data; oversized local queries fail", () => {
  assert.throws(() => reconcileAiBill(parse(), [localCall({ provider: "other.com" })]));
  assert.throws(() => reconcileAiBill(parse(), [localCall({ createdAt: new Date("2026-11-01T00:00:00Z") })]));
  assert.throws(() => reconcileAiBill(parse(), Array(100001).fill(localCall())));
  assert.equal(reconcileAiBill(parse({ entries: [] }), []).status, "MATCHED");
});

const url = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const isolated = url && ["localhost", "127.0.0.1"].includes(url.hostname) && /^zhixian_.*(?:test|e2e)$/.test(url.pathname.slice(1));
if (process.env.CI === "true") assert.ok(isolated, "CI must run reconciliation integration tests with isolated PostgreSQL");
const cli = (path, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/reconcile-ai-bill.mjs", path], { env: { ...process.env, ...env } });
  let output = ""; child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  child.once("error", reject); child.once("exit", (code) => resolve({ code, output }));
});

test("real HTTP request IDs persist; read-only PostgreSQL reconciliation CLI and error exits", { skip: !isolated }, async (t) => {
  const db = new PrismaClient(), prefix = `bill-${randomUUID()}`;
  const directory = await mkdtemp(join(tmpdir(), "zhixian-bill-test-")), path = join(directory, "bill.json");
  let invalidHeader = false, responseStatus = 200;
  const server = createServer((req, res) => {
    res.writeHead(responseStatus, { "Content-Type": "application/json", "x-request-id": invalidHeader ? "invalid/id" : "req-header-one" });
    res.end(JSON.stringify({ id: "req-body-fallback", usage: { prompt_tokens: 100, completion_tokens: 50 }, choices: [] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const provider = `127.0.0.1:${server.address().port}`;
  const env = { AI_PRICING_JSON: JSON.stringify({ [`${provider}/test`]: { version: "v1", inputPerMillion: 2, outputPerMillion: 4 } }) };
  const call = () => trackedAiFetch(db, prefix, "test", fetch, env)(`http://${provider}/?key=private-key`, { method: "POST", body: "private-prompt" });
  const rows = () => db.aiCall.findMany({ where: { scope: prefix }, orderBy: { createdAt: "asc" } });
  try {
    await t.test("safe header wins over body id and invalid header falls back", async () => {
      await call(); invalidHeader = true; await call();
      const records = await rows();
      assert.deepEqual(records.map((row) => row.providerRequestId), ["req-header-one", "req-body-fallback"]);
      assert.equal(JSON.stringify(records).includes("private-key"), false); assert.equal(JSON.stringify(records).includes("private-prompt"), false);
    });
    const bill = { ...format(), provider, periodStart: new Date(Date.now() - 60000).toISOString(), periodEnd: new Date(Date.now() + 60000).toISOString(), entries: [{ requestId: "req-header-one", model: "test", billedUsd: "0.0004" }, { requestId: "req-body-fallback", model: "test", billedUsd: "0.0004" }] };
    await t.test("actual CLI returns matched totals and leaves telemetry and budget unchanged", async () => {
      await writeFile(path, JSON.stringify(bill));
      const before = await rows(), budgetCount = await db.aiBudgetReservation.count();
      const result = await cli(path); assert.equal(result.code, 0, result.output);
      const report = JSON.parse(result.output); assert.equal(report.counts.matched, 2); assert.equal(report.billedUsd, "0.000800");
      assert.deepEqual(await rows(), before); assert.equal(await db.aiBudgetReservation.count(), budgetCount);
      assert.equal(result.output.includes("req-header-one"), false);
    });
    await t.test("actual CLI distinguishes differences, malformed input and database errors", async () => {
      await writeFile(path, JSON.stringify({ ...bill, entries: [{ ...bill.entries[0], billedUsd: "0.001" }, bill.entries[1]] }));
      let result = await cli(path); assert.equal(result.code, 2, result.output); assert.equal(JSON.parse(result.output).counts.differences, 1);
      await writeFile(path, "private-invalid-bill"); result = await cli(path); assert.equal(result.code, 1); assert.equal(result.output.includes("private-invalid-bill"), false);
      result = await cli(join(directory, "absent.json")); assert.equal(result.code, 1);
      await writeFile(path, JSON.stringify(bill));
      result = await cli(path, { DATABASE_URL: "postgresql://test:private-password@127.0.0.1:1/zhixian_bill_test?connect_timeout=1" });
      assert.equal(result.code, 1); assert.equal(result.output.includes("private-password"), false);
    });
    await t.test("reused supplier IDs and failed requests cannot report a clean match", async () => {
      invalidHeader = false; responseStatus = 503; await call();
      const report = reconcileAiBill(parseAiBill(JSON.stringify(bill)), await rows());
      assert.equal(report.status, "REVIEW_REQUIRED"); assert.equal(report.counts.duplicateLocalIds, 1); assert.equal(report.counts.transportFailures, 1);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve)); await db.aiCall.deleteMany({ where: { scope: prefix } });
    await db.$disconnect(); await rm(directory, { recursive: true, force: true });
  }
});
