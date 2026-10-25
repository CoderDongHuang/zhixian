import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { ApiRequestError, clearAccessToken, request } from "./api";
import { clearUserStorage, getRefreshToken, readSettings } from "./storage";

type AuthState = { loading: boolean; error: string; signedIn: boolean; locked: boolean; unlock(): Promise<boolean>; refresh(): Promise<void>; logout(): Promise<void> };
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [locked, setLocked] = useState(false);
  async function refresh() {
    setLoading(true); setError("");
    try {
      const token = await getRefreshToken();
      if (!token) { setSignedIn(false); setLocked(false); return; }
      // Read the local lock before allowing cached content during a network failure.
      const settings = await readSettings();
      let allowed = false;
      try {
        const response = await request("/api/mini/feed");
        if (response.status >= 500 || response.status === 429) throw new ApiRequestError("network", "Session check is temporarily unavailable");
        allowed = response.ok;
      } catch (failure) {
        if (!(failure instanceof ApiRequestError)) throw failure;
        // Cached reading does not grant server access. A rejected/revoked session
        // has already lost its refresh token and must return to login.
        allowed = Boolean(await getRefreshToken());
      }
      setSignedIn(allowed); setLocked(allowed && settings.biometricLock);
    } catch {
      setSignedIn(false); setLocked(false);
      setError("登录状态读取失败，请重试");
    } finally { setLoading(false); }
  }
  async function unlock() { const result = await LocalAuthentication.authenticateAsync({ promptMessage: "解锁知线", cancelLabel: "取消", disableDeviceFallback: false }); setLocked(!result.success); return result.success; }
  async function logout() { await request("/api/mini/auth/logout", { method: "POST" }); await clearUserStorage(); clearAccessToken(); setSignedIn(false); setLocked(false); }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { const subscription = AppState.addEventListener("change", (state) => { if (state === "background" && signedIn) void readSettings().then((settings) => { if (settings.biometricLock) setLocked(true); }).catch(() => setLocked(true)); }); return () => subscription.remove(); }, [signedIn]);
  return <AuthContext.Provider value={{ loading, error, signedIn, locked, unlock, refresh, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing"); return value; }
