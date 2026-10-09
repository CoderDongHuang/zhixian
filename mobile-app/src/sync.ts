import NetInfo from "@react-native-community/netinfo";
import { request } from "./api";
import { commitSync, getDeviceId, getUserStorageGeneration, readQueue, readSync, readSyncCursor, updateQueue } from "./storage";
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

let pulling: Promise<SyncSnapshot | null> | null = null;
export function pullSync(): Promise<SyncSnapshot | null> {
  if (!pulling) pulling = performPull().finally(() => { pulling = null; });
  return pulling;
}
async function performPull(): Promise<SyncSnapshot | null> {
  const generation = getUserStorageGeneration();
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
      cursor = data.cursor;
      if (!await commitSync(snapshot, cursor, generation)) return readSync();
      if (!data.hasMore) return snapshot;
    }
    throw new Error("Sync pagination limit exceeded");
  } catch {
    return readSync();
  }
}

let changedAt = 0;
export async function enqueueMutation(resource: MutationResource, resourceId: string, value: object) {
  changedAt = Math.max(Date.now(), changedAt + 1);
  const mutation: QueuedMutation = { id: id(), resource, resourceId, value, changedAt: new Date(changedAt).toISOString(), attempts: 0, status: "pending" };
  await updateQueue((queue) => [...queue, mutation]);
  return flushQueue();
}
let flushing: Promise<{ sent: number; pending: number; failed: number }> | null = null;
export function flushQueue() {
  if (!flushing) flushing = performFlush().finally(() => { flushing = null; });
  return flushing;
}
async function performFlush() {
  const startedAt = Date.now();
  const generation = getUserStorageGeneration();
  const state = await NetInfo.fetch();
  let sent = 0;
  if (state.isConnected) {
    const queue = await readQueue();
    const deviceId = await getDeviceId();
    const blocked = new Set<string>();
    for (const mutation of queue) {
      if (generation !== getUserStorageGeneration()) break;
      const key = `${mutation.resource}:${mutation.resourceId}`;
      if (mutation.status === "failed" || blocked.has(key)) { blocked.add(key); continue; }
      try {
        const response = await request("/api/mini/sync", { method: "POST", headers: { "Idempotency-Key": mutation.id }, body: JSON.stringify({ deviceId, mutations: [{ resource: mutation.resource, resourceId: mutation.resourceId, value: mutation.value, changedAt: mutation.changedAt }] }) });
        if (response.ok) {
          await updateQueue((latest) => latest.filter((item) => item.id !== mutation.id), generation);
          sent++;
          continue;
        }
        const auth = response.status === 401;
        const attempts = auth ? mutation.attempts : mutation.attempts + 1;
        const retryable = response.status >= 500 || response.status === 429;
        await updateQueue((latest) => latest.map((item) => item.id === mutation.id ? { ...item, attempts, status: auth ? "auth" : !retryable || attempts >= 5 ? "failed" : "pending", error: auth ? "需要重新登录" : `HTTP ${response.status}` } : item), generation);
        blocked.add(key);
        if (auth) break;
      } catch {
        const attempts = mutation.attempts + 1;
        await updateQueue((latest) => latest.map((item) => item.id === mutation.id ? { ...item, attempts, status: attempts >= 5 ? "failed" : "pending", error: "网络请求失败" } : item), generation);
        blocked.add(key);
      }
    }
  }
  const remaining = await readQueue();
  const result = { sent, pending: remaining.length, failed: remaining.filter((item) => item.status === "failed" || item.status === "auth").length };
  void track("sync_complete", { ...result, durationMs: Date.now() - startedAt });
  return result;
}
export async function retryFailedMutations() {
  await updateQueue((queue) => queue.map((item) => ({ ...item, attempts: 0, status: "pending", error: undefined })));
  return flushQueue();
}
export const pushMutation = enqueueMutation;
export function startReconnectSync(onSynced?: () => void) { return NetInfo.addEventListener((state) => { if (state.isConnected) void flushQueue().then(() => pullSync()).then(() => onSynced?.()); }); }
