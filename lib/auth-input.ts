type AuthKind = "request" | "webVerify" | "nativeVerify" | "bind" | "wechat" | "refresh";
type AuthInput = { email: string; code: string; inviteCode: string; deviceId: string; refreshToken: string };
const fields: Record<AuthKind, { required: (keyof AuthInput)[]; optional: (keyof AuthInput)[] }> = {
  request: { required: ["email"], optional: ["inviteCode", "deviceId"] },
  webVerify: { required: ["email", "code"], optional: ["inviteCode", "deviceId"] },
  nativeVerify: { required: ["email", "code", "deviceId"], optional: [] },
  bind: { required: ["email", "code"], optional: [] },
  wechat: { required: ["code", "deviceId"], optional: [] },
  refresh: { required: ["refreshToken", "deviceId"], optional: [] },
};
const limits: Record<keyof AuthInput, number> = { email: 254, code: 512, inviteCode: 128, deviceId: 128, refreshToken: 512 };

export async function parseAuthInput(request: Request, kind: AuthKind): Promise<AuthInput | null> {
  try {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const schema = fields[kind];
    const allowed = [...schema.required, ...schema.optional];
    const raw = body as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !allowed.includes(key as keyof AuthInput))) return null;
    const result: AuthInput = { email: "", code: "", inviteCode: "", deviceId: "", refreshToken: "" };
    for (const key of allowed) {
      if (raw[key] === undefined && schema.optional.includes(key)) continue;
      if (typeof raw[key] !== "string" || raw[key].length > limits[key]) return null;
      result[key] = raw[key].trim();
      if (schema.required.includes(key) && !result[key]) return null;
    }
    result.email = result.email.toLowerCase();
    if (allowed.includes("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) return null;
    if (kind !== "wechat" && allowed.includes("code") && !/^\d{6}$/.test(result.code)) return null;
    return result;
  } catch { return null; }
}
