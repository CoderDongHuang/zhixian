import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { FeedItem, SyncSnapshot } from "./types";

const REFRESH_TOKEN = "zhixian.refreshToken";
const DEVICE_ID = "zhixian.deviceId";
const FEED_CACHE = "zhixian.feed";
const OFFLINE_CACHE = "zhixian.offline";
const SYNC_CACHE = "zhixian.sync";

export async function getDeviceId() {
  let value = await SecureStore.getItemAsync(DEVICE_ID);
  if (!value) { value = `native-${Date.now()}-${Math.random().toString(36).slice(2)}`; await SecureStore.setItemAsync(DEVICE_ID, value); }
  return value;
}
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_TOKEN);
export const setRefreshToken = (value: string) => SecureStore.setItemAsync(REFRESH_TOKEN, value);
export const clearRefreshToken = () => SecureStore.deleteItemAsync(REFRESH_TOKEN);
export async function readJson<T>(key: string, fallback: T): Promise<T> { const raw = await AsyncStorage.getItem(key); if (!raw) return fallback; try { return JSON.parse(raw) as T; } catch { return fallback; } }
export const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));
export const readFeed = () => readJson<FeedItem[]>(FEED_CACHE, []);
export const writeFeed = (value: FeedItem[]) => writeJson(FEED_CACHE, value);
export const readOffline = () => readJson<FeedItem[]>(OFFLINE_CACHE, []);
export async function saveOffline(item: FeedItem) { const items = await readOffline(); await writeJson(OFFLINE_CACHE, [item, ...items.filter((value) => value.id !== item.id)]); }
export async function removeOffline(id: string) { const items = await readOffline(); await writeJson(OFFLINE_CACHE, items.filter((value) => value.id !== id)); }
export const readSync = () => readJson<SyncSnapshot | null>(SYNC_CACHE, null);
export const writeSync = (value: SyncSnapshot) => writeJson(SYNC_CACHE, value);
export const clearUserStorage = () => Promise.all([clearRefreshToken(), AsyncStorage.removeItem(SYNC_CACHE)]);
