import { request } from "./api";
import { getDeviceId, readSync, writeSync } from "./storage";
import type { SyncSnapshot } from "./types";

const key = () => `native-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export async function pullSync(): Promise<SyncSnapshot | null> { const response = await request("/api/mini/sync?cursor=0"); if (!response.ok) return readSync(); const data = await response.json(); if (data.snapshot) await writeSync(data.snapshot); return data.snapshot || readSync(); }
export async function pushMutation(resource: "bookmark" | "read" | "learning_task", resourceId: string, value: object) { const deviceId = await getDeviceId(); return request("/api/mini/sync", { method: "POST", headers: { "Idempotency-Key": key() }, body: JSON.stringify({ deviceId, mutations: [{ resource, resourceId, value, changedAt: new Date().toISOString() }] }) }); }
