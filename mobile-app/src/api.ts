import { clearRefreshToken, getDeviceId, getRefreshToken, setRefreshToken } from "./storage";
import type { SessionTokens } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://zhixian.asia";
const DEFAULT_TIMEOUT_MS = 15_000;
let accessToken = "";
let refreshPromise: Promise<boolean> | null = null;

export class ApiRequestError extends Error {
  constructor(public readonly kind: "timeout" | "cancelled" | "network", message: string, options?: ErrorOptions) { super(message, options); this.name = "ApiRequestError"; }
}

function retryableStatus(status: number) { return status === 429 || status === 502 || status === 503 || status === 504; }
function wait(milliseconds: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new ApiRequestError("cancelled", "Request cancelled")); }, { once: true });
  });
}

export async function fetchWithPolicy(url: string, init: RequestInit = {}, options: { timeoutMs?: number; retries?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? 0;
  if (init.signal?.aborted) throw new ApiRequestError("cancelled", "Request cancelled");
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const cancel = () => controller.abort();
    init.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (attempt < retries && retryableStatus(response.status)) { await wait(250 * (attempt + 1), init.signal); continue; }
      return response;
    } catch (error) {
      if (init.signal?.aborted) throw new ApiRequestError("cancelled", "Request cancelled", { cause: error });
      if (timedOut) throw new ApiRequestError("timeout", `Request timed out after ${timeoutMs}ms`, { cause: error });
      if (attempt >= retries) throw new ApiRequestError("network", "Network request failed", { cause: error });
      await wait(250 * (attempt + 1), init.signal);
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", cancel);
    }
  }
  throw new ApiRequestError("network", "Network request failed");
}

async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const [refreshToken, deviceId] = await Promise.all([getRefreshToken(), getDeviceId()]);
    if (!refreshToken) return false;
    const response = await fetchWithPolicy(`${API_URL}/api/mini/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken, deviceId }) });
    if (!response.ok) { accessToken = ""; await clearRefreshToken(); return false; }
    const tokens = await response.json() as SessionTokens; accessToken = tokens.accessToken; await setRefreshToken(tokens.refreshToken); return true;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function request(path: string, init: RequestInit = {}, retryAuth = true) {
  if (!accessToken) await refreshSession();
  const method = (init.method || "GET").toUpperCase();
  const response = await fetchWithPolicy(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } }, { retries: method === "GET" ? 1 : 0 });
  if (response.status !== 401 || !retryAuth || !(await refreshSession())) return response;
  return request(path, init, false);
}
export async function requestCode(email: string, signal?: AbortSignal) { const deviceId = await getDeviceId(); return fetchWithPolicy(`${API_URL}/api/auth/request-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, deviceId }), signal }); }
export async function verifyCode(email: string, code: string, signal?: AbortSignal) { const deviceId = await getDeviceId(); const response = await fetchWithPolicy(`${API_URL}/api/mobile/auth/verify-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, deviceId }), signal }); if (response.ok) await installSession(await response.json()); return response; }
export async function installSession(tokens: SessionTokens) { accessToken = tokens.accessToken; await setRefreshToken(tokens.refreshToken); }
export function clearAccessToken() { accessToken = ""; }
export { API_URL };
