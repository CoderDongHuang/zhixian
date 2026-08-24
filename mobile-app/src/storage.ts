import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { AppSettings, ArticleDetail, FeedItem, QueuedMutation, SyncSnapshot } from "./types";

const KEYS = { refresh: "zhixian.refreshToken", device: "zhixian.deviceId", feed: "zhixian.feed", offline: "zhixian.offline.v2", sync: "zhixian.sync", syncCursor: "zhixian.syncCursor", queue: "zhixian.mutationQueue", settings: "zhixian.settings" };
export const DEFAULT_SETTINGS: AppSettings = { fontScale: 1, speechRate: 0.95, notifications: { digest: true, learning: true }, cacheLimitMb: 50, cacheTtlDays: 30, biometricLock: false, analytics: true };

export async function getDeviceId() { let value = await SecureStore.getItemAsync(KEYS.device); if (!value) { value = `native-${Date.now()}-${Math.random().toString(36).slice(2)}`; await SecureStore.setItemAsync(KEYS.device, value); } return value; }
export const getRefreshToken = () => SecureStore.getItemAsync(KEYS.refresh);
export const setRefreshToken = (value: string) => SecureStore.setItemAsync(KEYS.refresh, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
export const clearRefreshToken = () => SecureStore.deleteItemAsync(KEYS.refresh);
export async function readJson<T>(key: string, fallback: T): Promise<T> { const raw = await AsyncStorage.getItem(key); if (!raw) return fallback; try { return JSON.parse(raw) as T; } catch { return fallback; } }
export const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));
export const readFeed = () => readJson<FeedItem[]>(KEYS.feed, []);
export const writeFeed = (value: FeedItem[]) => writeJson(KEYS.feed, value);
export const readOffline = () => readJson<ArticleDetail[]>(KEYS.offline, []);
export async function saveOffline(item: ArticleDetail, settings = DEFAULT_SETTINGS) {
  const items = await purgeOffline(settings);
  const next = [{ ...item, cachedAt: new Date().toISOString() }, ...items.filter((value) => value.id !== item.id)];
  const maxBytes = settings.cacheLimitMb * 1024 * 1024;
  while (next.length > 1 && JSON.stringify(next).length * 2 > maxBytes) next.pop();
  await writeJson(KEYS.offline, next);
}
export async function purgeOffline(settings = DEFAULT_SETTINGS) { const cutoff = Date.now() - settings.cacheTtlDays * 86_400_000; const items = await readOffline(); const valid = items.filter((item) => !item.cachedAt || new Date(item.cachedAt).getTime() >= cutoff); if (valid.length !== items.length) await writeJson(KEYS.offline, valid); return valid; }
export async function removeOffline(id: string) { await writeJson(KEYS.offline, (await readOffline()).filter((value) => value.id !== id)); }
export const clearOffline = () => AsyncStorage.removeItem(KEYS.offline);
export async function offlineSizeBytes() { return JSON.stringify(await readOffline()).length * 2; }
export const readSync = () => readJson<SyncSnapshot | null>(KEYS.sync, null);
export const writeSync = (value: SyncSnapshot) => writeJson(KEYS.sync, value);
export const readSyncCursor = () => readJson<string>(KEYS.syncCursor, "0");
export const writeSyncCursor = (value: string) => writeJson(KEYS.syncCursor, value);
export const readQueue = () => readJson<QueuedMutation[]>(KEYS.queue, []);
export const writeQueue = (value: QueuedMutation[]) => writeJson(KEYS.queue, value);
export const readSettings = () => readJson<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
export const writeSettings = (value: AppSettings) => writeJson(KEYS.settings, value);
export const clearUserStorage = () => Promise.all([clearRefreshToken(), AsyncStorage.multiRemove([KEYS.sync, KEYS.syncCursor, KEYS.queue])]);
