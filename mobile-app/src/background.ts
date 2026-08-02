import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { flushQueue, pullSync } from "./sync";
import { purgeOffline, readSettings } from "./storage";

export const BACKGROUND_SYNC_TASK = "zhixian-background-sync";
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => { try { await flushQueue(); await pullSync(); await purgeOffline(await readSettings()); return BackgroundTask.BackgroundTaskResult.Success; } catch { return BackgroundTask.BackgroundTaskResult.Failed; } });
export async function registerBackgroundSync() { const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK); if (!registered) await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 }); }
