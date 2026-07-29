import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://zhixian.asia";
const deviceId = `native-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let accessToken = "";

export async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
  if (response.status !== 401) return response;
  const refreshToken = await SecureStore.getItemAsync("refreshToken"); if (!refreshToken) return response;
  const refreshed = await fetch(`${API_URL}/api/mini/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken, deviceId }) });
  if (!refreshed.ok) { await SecureStore.deleteItemAsync("refreshToken"); return response; }
  const tokens = await refreshed.json(); accessToken = tokens.accessToken; await SecureStore.setItemAsync("refreshToken", tokens.refreshToken);
  return fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${accessToken}` } });
}

export async function installSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken; await SecureStore.setItemAsync("refreshToken", tokens.refreshToken);
}

export { deviceId };
