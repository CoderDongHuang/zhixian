export function isPageAvailable(responseOk, body) {
  if (!responseOk || !body.trim()) return false;
  // Next.js can stream an error page after sending HTTP 200. Its text may
  // contain comments/tags between words, so inspect visible text as well.
  const visible = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[^]*?-->/g, "").replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ").replace(/\s+/g, " ");
  return !/application error\s*:\s*a (?:server|client)[- ]side exception has occurred/i.test(visible)
    && !/id\s*=\s*["']__next_error__["']/i.test(body);
}

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
