const baseUrl = process.env.MONITOR_URL || "https://zhixian.asia";
const threshold = Number(process.env.MONITOR_THRESHOLD_MS || 3500);
const checks = [["health", "/api/health"], ["home", "/"], ["entities", "/entities"], ["relations", "/relations?kind=entity"]];
let failed = 0;
for (const [name, path] of checks) {
  const attempts = [];
  let healthy = false;
  for (let attempt = 1; attempt <= 2 && !healthy; attempt++) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers: { "User-Agent": "zhixian-production-monitor/0.3.1" }, signal: AbortSignal.timeout(12000) });
      const body = await response.text(); const elapsed = Math.round(performance.now() - started);
      healthy = response.ok && body.length > 0 && elapsed <= threshold;
      if (name === "health") { try { healthy &&= JSON.parse(body).database === "ok"; } catch { healthy = false; } }
      attempts.push({ attempt, status: response.status, elapsedMs: elapsed });
    } catch (error) {
      attempts.push({ attempt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  console.log(JSON.stringify({ level: healthy ? "info" : "error", check: name, healthy, thresholdMs: threshold, attempts }));
  if (!healthy) failed++;
}
if (failed) process.exitCode = 1;
