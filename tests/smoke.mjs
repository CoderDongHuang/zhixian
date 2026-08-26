const baseUrl = process.env.SMOKE_URL || "https://zhixian.asia";
const checks = [
  ["home", "/", 200],
  ["digests", "/digests", 200],
  ["manifest", "/manifest.webmanifest", 200],
  ["service-worker", "/sw.js", 200],
  ["offline", "/offline", 200],
  ["health", "/api/health", 200],
  ["entities", "/entities", 200],
  ["timeline", "/timeline", 200],
  ["trends", "/trends", 200],
  ["industry", "/industry", 200],
];
let failed = 0;
for (const [name, path, expected] of checks) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    const ok = response.status === expected && body.length > 0;
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${response.status} ${body.length} bytes`);
    if (!ok) failed++;
  } catch (error) {
    console.log(`FAIL ${name} ${error.message}`);
    failed++;
  }
}
if (failed) process.exitCode = 1;
