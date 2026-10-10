import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "zhixian-audit-test-"));
const mockCli = path.join(temporary, "npm-audit.mjs");
await writeFile(mockCli, "process.stdout.write(process.env.AUDIT_MOCK_OUTPUT); process.exitCode = Number(process.env.AUDIT_MOCK_STATUS);\n");
after(() => rm(temporary, { recursive: true, force: true }));

function report(severity, source = 9999999) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  const vulnerabilities = {};
  if (severity) {
    counts[severity] = 1; counts.total = 1;
    vulnerabilities.fixture = { severity, via: [{ source, severity, name: "fixture", title: "Fixture advisory" }] };
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
}

function run(output, status = 1) {
  const result = spawnSync(process.execPath, ["scripts/check-dependency-audit.mjs"], {
    cwd: root, encoding: "utf8", timeout: 10000,
    env: { ...process.env, npm_execpath: mockCli, AUDIT_MOCK_OUTPUT: typeof output === "string" ? output : JSON.stringify(output), AUDIT_MOCK_STATUS: String(status) },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

for (const [name, output, status, expected] of [
  ["clean npm report", report(), 0, 0],
  ["moderate finding preserves current policy", report("moderate"), 1, 0],
  ["new high advisory", report("high"), 1, 1],
  ["critical advisory cannot be exempted", report("critical", 1119441), 1, 1],
  ["removed image-size exception cannot recur silently", report("high", 1138808), 1, 1],
  ["npm network error JSON", { error: { code: "ENOTFOUND", summary: "registry unavailable" } }, 1, 1],
  ["empty response", "", 1, 1],
  ["invalid JSON", "not JSON", 1, 1],
  ["JSON null", null, 1, 1],
  ["missing report fields", {}, 0, 1],
  ["unsupported report version", { ...report(), auditReportVersion: 3 }, 0, 1],
  ["abnormal npm exit despite clean JSON", report(), 2, 1],
  ["npm error alongside clean JSON", { ...report(), error: { code: "EACCES" } }, 1, 1],
  ["missing package findings", { ...report("high"), vulnerabilities: {} }, 1, 1],
  ["invalid vulnerability counts", { ...report(), metadata: { vulnerabilities: { total: 0 } } }, 0, 1],
  ["malformed advisory", { ...report("high"), vulnerabilities: { fixture: { severity: "high", via: [{}] } } }, 1, 1],
  ["unresolved advisory reference", { ...report("high"), vulnerabilities: { fixture: { severity: "high", via: ["missing"] } } }, 1, 1],
]) {
  test(`dependency gate: ${name}`, () => {
    const result = run(output, status);
    assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
  });
}

function backportReport({ source = 1240992, severity = "high", name = "braces", nodes = ["node_modules/braces"] } = {}) {
  const result = report(severity, source);
  result.vulnerabilities = { [name]: { name, severity, nodes, via: [{ source, severity, name, title: "Backport fixture" }] } };
  return result;
}

for (const [name, overrides, expected] of [
  ["exact verified braces source", {}, 0],
  ["unreported affected installation", { nodes: [] }, 1],
  ["unknown affected installation", { nodes: ["node_modules/unknown/braces"] }, 1],
  ["different braces advisory", { source: 9999998 }, 1],
  ["critical cannot use a high backport", { severity: "critical" }, 1],
  ["advisory package mismatch", { name: "fixture" }, 1],
]) test(`dependency gate backport: ${name}`, () => {
  const result = run(backportReport(overrides));
  assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
});
