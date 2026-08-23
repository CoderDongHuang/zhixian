import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const baselineUrl = new URL("../docs/security/dependency-audit-baseline.json", import.meta.url);
const baseline = JSON.parse(await readFile(baselineUrl, "utf8"));
const accepted = new Set(baseline.acceptedAdvisories.map(Number));
const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : "npm";
const args = npmCli ? [npmCli, "audit", "--omit=dev", "--json"] : ["audit", "--omit=dev", "--json"];
const audit = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" && !npmCli, maxBuffer: 20 * 1024 * 1024 });

if (!audit.stdout) {
  console.error(audit.error?.message || audit.stderr || "npm audit produced no JSON output");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("npm audit returned invalid JSON");
  process.exit(1);
}

const rootAdvisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities || {})) {
  for (const via of vulnerability.via || []) {
    if (via && typeof via === "object" && via.source) rootAdvisories.set(Number(via.source), via);
  }
}
const blocked = [...rootAdvisories.values()].filter((item) => ["high", "critical"].includes(item.severity) && !accepted.has(Number(item.source)));
const counts = report.metadata?.vulnerabilities || {};
console.log(JSON.stringify({ type: "dependency-audit-summary", ...counts, acceptedAdvisories: [...accepted], blocked: blocked.map(({ source, name, severity, title }) => ({ source, name, severity, title })) }));

if (Number(counts.critical || 0) > 0 || blocked.length > 0) process.exitCode = 1;
