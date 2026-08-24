export function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export function evaluateMonitorSamples(samples, thresholdMs, requiredConsecutiveFailures = 2) {
  let trailingFailures = 0;
  for (let index = samples.length - 1; index >= 0 && !samples[index].available; index--) trailingFailures++;
  const performanceSamples = samples.slice(1).filter((sample) => sample.available && Number.isFinite(sample.elapsedMs)).map((sample) => sample.elapsedMs);
  const p95Ms = percentile95(performanceSamples);
  const unavailable = trailingFailures >= requiredConsecutiveFailures;
  const slow = !unavailable && p95Ms !== null && p95Ms > thresholdMs;
  return { status: unavailable ? "unavailable" : slow ? "degraded" : "healthy", unavailable, slow, p95Ms, trailingFailures };
}
