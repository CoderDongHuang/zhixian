import { evaluateMonitorSamples, isPageAvailable } from "./monitor-policy.mjs";

const baseUrl = process.env.MONITOR_URL || "https://zhixian.asia";
const thresholdMs = Number(process.env.MONITOR_THRESHOLD_MS || 5000);
const sampleCount = Math.max(3, Number(process.env.MONITOR_SAMPLE_COUNT || 3));
const checks = [["health", "/api/health"], ["home", "/"], ["entities", "/entities"], ["relations", "/relations?kind=entity"]];
let unavailableChecks = 0;
let degradedChecks = 0;
let operationalFailure = false;

for (const [name, path] of checks) {
  const samples = [];
  for (let sample = 1; sample <= sampleCount; sample++) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers: { "User-Agent": "zhixian-production-monitor/0.4.0" }, signal: AbortSignal.timeout(12000) });
      const body = await response.text();
      const elapsedMs = Math.round(performance.now() - started);
      let available = isPageAvailable(response.ok, body);
      if (name === "health") { try { available &&= JSON.parse(body).database === "ok"; } catch { available = false; } }
      samples.push({ sample, available, status: response.status, elapsedMs });
    } catch (error) {
      samples.push({ sample, available: false, error: error instanceof Error ? error.message : String(error), elapsedMs: Math.round(performance.now() - started) });
    }
  }
  const result = evaluateMonitorSamples(samples, thresholdMs);
  if (result.unavailable) unavailableChecks++;
  if (result.slow) degradedChecks++;
  console.log(JSON.stringify({ level: result.unavailable ? "error" : result.slow ? "warning" : "info", check: name, thresholdMs, coldStartExcluded: true, ...result, samples }));
}

try {
  if (!process.env.MONITOR_TOKEN) throw new Error("MONITOR_TOKEN missing; data health cannot be confirmed");
  const response = await fetch(`${baseUrl}/api/admin/operations`, { headers: { Authorization: `Bearer ${process.env.MONITOR_TOKEN}` }, signal: AbortSignal.timeout(12000) });
  const data = await response.json();
  if (!response.ok || !["SUCCEEDED", "PAUSED"].includes(data.status)) operationalFailure = true;
  console.log(JSON.stringify({ check: "operations", ...data }));
} catch (error) { operationalFailure = true; console.error(JSON.stringify({ check: "operations", status: "UNKNOWN", error: error.message })); }
console.log(JSON.stringify({ status: unavailableChecks || operationalFailure ? "FAILED" : degradedChecks ? "WARNING" : "SUCCEEDED", unavailableChecks, degradedChecks, operationalFailure }));
if (unavailableChecks || operationalFailure) process.exitCode = 1;
