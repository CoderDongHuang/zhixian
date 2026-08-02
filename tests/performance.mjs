const baseUrl = process.env.PERFORMANCE_URL || "https://zhixian.asia";
const thresholdMs = Number(process.env.PERFORMANCE_THRESHOLD_MS || 2500);
const paths = ["/", "/digests", "/entities", "/timeline", "/industry", "/relations?kind=entity"];
let failed = 0;

for (const path of paths) {
  const samples = [];
  let requestFailed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const started = performance.now();
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      samples.push(Math.round(performance.now() - started));
      if (!response.ok) { requestFailed = true; break; }
    } catch (error) {
      console.error(`FAIL ${path} request=${error instanceof Error ? error.message : String(error)}`);
      requestFailed = true;
      break;
    }
  }
  if (requestFailed || samples.length < 2) { failed++; continue; }
  const warmSamples = samples.slice(1).sort((a, b) => a - b);
  const warmMs = warmSamples[Math.ceil(warmSamples.length * 0.95) - 1];
  const ok = warmMs <= thresholdMs;
  console.log(`${ok ? "PASS" : "FAIL"} ${path} warm=${warmMs}ms samples=${samples.join(",")}ms threshold=${thresholdMs}ms`);
  if (!ok) failed++;
}

if (failed) process.exitCode = 1;
