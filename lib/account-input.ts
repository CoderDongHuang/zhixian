export function sameOrigin(request: Request, appUrl = process.env.APP_URL) {
  const origin = request.headers.get("origin");
  // Next route handlers can expose an internal host/port in request.url.
  // Use the configured public origin rather than trusting forwarded headers.
  try {
    const expected = new URL(appUrl || request.url).origin;
    return (!origin || origin === expected) && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}

export async function readAccountJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : null;
  } catch { return null; }
}

export const isCode = (value: unknown): value is string => typeof value === "string" && /^\d{6}$/.test(value);
