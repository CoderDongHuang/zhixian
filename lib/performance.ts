export async function measured<T>(operation: string, callback: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    const payload = { type: "performance", operation, durationMs, slow: durationMs >= 750, timestamp: new Date().toISOString() };
    if (payload.slow) console.warn(JSON.stringify(payload));
    else if (process.env.PERFORMANCE_LOGS === "true") console.info(JSON.stringify(payload));
  }
}
