import NetInfo from "@react-native-community/netinfo";
import { request } from "./api";
import { getDeviceId, readQueue, readSync, readSyncCursor, writeQueue, writeSync, writeSyncCursor } from "./storage";
import type { MutationResource, QueuedMutation, SyncChange, SyncSnapshot } from "./types";
import { track } from "./telemetry";

const id = () => `native-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function applySyncChanges(snapshot: SyncSnapshot, changes: SyncChange[]) {
  const next = { ...snapshot, bookmarks: [...snapshot.bookmarks], reads: [...snapshot.reads], paths: [...snapshot.paths], tasks: [...snapshot.tasks] };
  for (const change of changes) {
    if (change.resource === "bookmark") {
      next.bookmarks = next.bookmarks.filter((item) => item.feedItemId !== change.resourceId);
      if (change.value.bookmarked) next.bookmarks.push({ feedItemId: change.resourceId });
    } else if (change.resource === "read") {
      next.reads = next.reads.filter((item) => item.feedItemId !== change.resourceId);
      if (change.value.read !== false) next.reads.push({ feedItemId: change.resourceId });
    } else if (change.resource === "learning_task") {
      const completedAt = change.value.completed ? (typeof change.value.completedAt === "string" ? change.value.completedAt : change.changedAt) : null;
      next.tasks = next.tasks.map((task) => task.id === change.resourceId ? { ...task, completedAt } : task);
      if (typeof change.value.pathId === "string" && typeof change.value.pathProgress === "number") next.paths = next.paths.map((path) => path.id === change.value.pathId ? { ...path, progress: change.value.pathProgress as number } : path);
    }
  }
  return next;
}

export async function pullSync(): Promise<SyncSnapshot | null> {
  try {
    let snapshot = await readSync();
    let cursor = snapshot ? await readSyncCursor() : "0";
    for (let page = 0; page < 100; page++) {
      const response = await request(`/api/mini/sync?cursor=${encodeURIComponent(cursor)}`);
      if (!response.ok) return snapshot;
      const data = await response.json() as { cursor: string; hasMore: boolean; reset?: boolean; snapshot: SyncSnapshot | null; changes: SyncChange[] };
      if (data.snapshot) snapshot = data.snapshot;
      if (!snapshot) return null;
      snapshot = applySyncChanges(snapshot, data.changes || []);
      await writeSync(snapshot);
      cursor = data.cursor;
      await writeSyncCursor(cursor);
      if (!data.hasMore) return snapshot;
    }
    throw new Error("Sync pagination limit exceeded");
  } catch {
    return readSync();
  }
}

export async function enqueueMutation(resource: MutationResource, resourceId: string, value: object) { const queue = await readQueue(); const mutation: QueuedMutation = { id: id(), resource, resourceId, value, changedAt: new Date().toISOString(), attempts: 0 }; await writeQueue([...queue.filter((item) => !(item.resource === resource && item.resourceId === resourceId)), mutation]); return flushQueue(); }
export async function flushQueue() { const startedAt = Date.now(); const state = await NetInfo.fetch(); if (!state.isConnected) return { sent: 0, pending: (await readQueue()).length }; const queue = await readQueue(); if (!queue.length) return { sent: 0, pending: 0 }; const deviceId = await getDeviceId(); let sent = 0; const pending: QueuedMutation[] = []; for (const mutation of queue) { try { const response = await request("/api/mini/sync", { method: "POST", headers: { "Idempotency-Key": mutation.id }, body: JSON.stringify({ deviceId, mutations: [{ resource: mutation.resource, resourceId: mutation.resourceId, value: mutation.value, changedAt: mutation.changedAt }] }) }); if (response.ok) sent += 1; else if (response.status >= 500 || response.status === 429) pending.push({ ...mutation, attempts: mutation.attempts + 1 }); } catch { pending.push({ ...mutation, attempts: mutation.attempts + 1 }); } } await writeQueue(pending.filter((item) => item.attempts < 5)); void track("sync_complete", { sent, pending: pending.length, durationMs: Date.now() - startedAt }); return { sent, pending: pending.length }; }
export const pushMutation = enqueueMutation;
export function startReconnectSync(onSynced?: () => void) { return NetInfo.addEventListener((state) => { if (state.isConnected) void flushQueue().then(() => pullSync()).then(() => onSynced?.()); }); }
