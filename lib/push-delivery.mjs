export const MAX_PUSH_RETRIES = 4;
export const PUSH_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

export function classifyPushError(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  if (statusCode === 404 || statusCode === 410) return "expired";
  return "retryable";
}

export function nextRetryAt(retryCount, now = new Date()) {
  const delays = [5, 15, 60, 180];
  const minutes = delays[Math.min(Math.max(retryCount - 1, 0), delays.length - 1)];
  return new Date(now.getTime() + minutes * 60_000);
}

export async function processClaimedPush({ send, markSent, markFailed, markExpired, invalidateDevice, retryCount, now = new Date() }) {
  try {
    const result = await send();
    await markSent({ providerId: result?.providerId || result?.headers?.location || null, sentAt: now });
    return "sent";
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    if (classifyPushError(error) === "expired") {
      await markExpired({ error: message, attemptedAt: now });
      await invalidateDevice();
      return "expired";
    }
    await markFailed({ error: message, nextAttemptAt: nextRetryAt(retryCount, now), attemptedAt: now });
    return "failed";
  }
}
