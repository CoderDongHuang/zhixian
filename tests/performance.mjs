const baseUrl = process.env.PERFORMANCE_URL || "https://zhixian.asia";
const thresholdMs = Number(process.env.PERFORMANCE_THRESHOLD_MS || 1500);
const paths = ["/", "/digests", "/entities", "/timeline", "/industry"];
let failed = 0;

for (const path of paths) {
  const samples = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
    await response.arrayBuffer();
    samples.push(Math.round(performance.now() - started));
    if (!response.ok) { failed++; break; }
  }
  const warmMs = Math.min(...samples.slice(1));
  const ok = warmMs <= thresholdMs;
  console.log(`${ok ? "PASS" : "FAIL"} ${path} warm=${warmMs}ms samples=${samples.join(",")}ms threshold=${thresholdMs}ms`);
  if (!ok) failed++;
}

if (failed) process.exitCode = 1;
