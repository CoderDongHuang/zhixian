import { clearRefreshToken, getDeviceId, getRefreshToken, setRefreshToken } from "./storage";
import type { SessionTokens } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://zhixian.asia";
let accessToken = "";
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const [refreshToken, deviceId] = await Promise.all([getRefreshToken(), getDeviceId()]);
    if (!refreshToken) return false;
    const response = await fetch(`${API_URL}/api/mini/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken, deviceId }) });
    if (!response.ok) { accessToken = ""; await clearRefreshToken(); return false; }
    const tokens = await response.json() as SessionTokens; accessToken = tokens.accessToken; await setRefreshToken(tokens.refreshToken); return true;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function request(path: string, init: RequestInit = {}, retry = true) {
  if (!accessToken) await refreshSession();
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
  if (response.status !== 401 || !retry || !(await refreshSession())) return response;
  return request(path, init, false);
}
export async function requestCode(email: string) { const deviceId = await getDeviceId(); return fetch(`${API_URL}/api/auth/request-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, deviceId }) }); }
export async function verifyCode(email: string, code: string) { const deviceId = await getDeviceId(); const response = await fetch(`${API_URL}/api/mobile/auth/verify-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, deviceId }) }); if (response.ok) await installSession(await response.json()); return response; }
export async function installSession(tokens: SessionTokens) { accessToken = tokens.accessToken; await setRefreshToken(tokens.refreshToken); }
export function clearAccessToken() { accessToken = ""; }
export { API_URL };
