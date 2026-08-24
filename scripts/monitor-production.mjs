import { evaluateMonitorSamples } from "./monitor-policy.mjs";

const baseUrl = process.env.MONITOR_URL || "https://zhixian.asia";
const thresholdMs = Number(process.env.MONITOR_THRESHOLD_MS || 5000);
const sampleCount = Math.max(3, Number(process.env.MONITOR_SAMPLE_COUNT || 3));
const checks = [["health", "/api/health"], ["home", "/"], ["entities", "/entities"], ["relations", "/relations?kind=entity"]];
let unavailableChecks = 0;
let degradedChecks = 0;

for (const [name, path] of checks) {
  const samples = [];
  for (let sample = 1; sample <= sampleCount; sample++) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers: { "User-Agent": "zhixian-production-monitor/0.4.0" }, signal: AbortSignal.timeout(12000) });
      const body = await response.text();
      const elapsedMs = Math.round(performance.now() - started);
      let available = response.ok && body.length > 0;
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

console.log(JSON.stringify({ status: unavailableChecks ? "FAILED" : degradedChecks ? "WARNING" : "SUCCEEDED", unavailableChecks, degradedChecks }));
if (unavailableChecks) process.exitCode = 1;
