import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const baselineUrl = new URL("../docs/security/dependency-audit-baseline.json", import.meta.url);
const baseline = JSON.parse(await readFile(baselineUrl, "utf8"));
const accepted = new Set(baseline.acceptedAdvisories.map(Number));
const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : "npm";
const args = npmCli ? [npmCli, "audit", "--omit=dev", "--json"] : ["audit", "--omit=dev", "--json"];
const audit = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" && !npmCli, maxBuffer: 20 * 1024 * 1024, timeout: 120000 });

if (audit.error || audit.signal || ![0, 1].includes(audit.status) || !audit.stdout) {
  console.error("npm audit did not complete successfully; dependency safety is unknown");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("npm audit returned invalid JSON");
  process.exit(1);
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const severities = ["info", "low", "moderate", "high", "critical"];
const counts = report?.metadata?.vulnerabilities;
const findings = report?.vulnerabilities;
function invalidReport() {
  console.error("npm audit returned an incomplete or inconsistent report; dependency safety is unknown");
  process.exit(1);
}

// npm can exit 1 with either findings or a registry error. Only a complete v2 report is evidence.
if (!isRecord(report) || report.error || report.auditReportVersion !== 2 || !isRecord(counts) || !isRecord(findings)) invalidReport();
if (![...severities, "total"].every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) invalidReport();
if (severities.reduce((sum, key) => sum + counts[key], 0) !== counts.total || Object.keys(findings).length !== counts.total) invalidReport();

const rootAdvisories = new Map();
const observedCounts = Object.fromEntries(severities.map((key) => [key, 0]));
for (const vulnerability of Object.values(findings)) {
  if (!isRecord(vulnerability) || !severities.includes(vulnerability.severity) || !Array.isArray(vulnerability.via) || !vulnerability.via.length) invalidReport();
  observedCounts[vulnerability.severity]++;
  for (const via of vulnerability.via) {
    if (typeof via === "string") {
      if (!Object.hasOwn(findings, via)) invalidReport();
    } else {
      if (!isRecord(via) || !Number.isSafeInteger(via.source) || via.source <= 0 || !severities.includes(via.severity)) invalidReport();
      rootAdvisories.set(via.source, via);
    }
  }
}
if (severities.some((key) => observedCounts[key] !== counts[key])) invalidReport();
if (counts.total > 0 && rootAdvisories.size === 0) invalidReport();
const blocked = [...rootAdvisories.values()].filter((item) => ["high", "critical"].includes(item.severity) && !accepted.has(Number(item.source)));
console.log(JSON.stringify({ type: "dependency-audit-summary", ...counts, acceptedAdvisories: [...accepted], blocked: blocked.map(({ source, name, severity, title }) => ({ source, name, severity, title })) }));

if (Number(counts.critical || 0) > 0 || blocked.length > 0) process.exitCode = 1;
