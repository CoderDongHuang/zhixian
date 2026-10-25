import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { request } from "./api";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });
function pushUnavailableMessage() {
  return Platform.OS === "android"
    ? "暂时无法连接推送服务，请确认 Google 基础服务已启用，并使用可访问 Google 服务的网络后重试"
    : "暂时无法连接推送服务，请检查网络后重试";
}

async function getPushToken(projectId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(pushUnavailableMessage())), 20_000); }),
    ]);
  } catch {
    // Native FCM errors can contain implementation details; keep recovery actionable.
    throw new Error(pushUnavailableMessage());
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function registerPush(categories = { digest: true, learning: true }) {
  // Android 13 needs a notification channel before the permission request.
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "知线通知", importance: Notifications.AndroidImportance.DEFAULT });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("未获得通知权限");
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error("尚未配置 EAS Project ID");
  const token = (await getPushToken(projectId)).data;
  const response = await request("/api/mobile/push/subscribe", { method: "POST", body: JSON.stringify({ token, platform: Platform.OS, categories }) });
  if (response.status === 401) throw new Error("登录已失效，请重新登录后注册设备推送");
  if (!response.ok) throw new Error("推送注册失败");
  return token;
}
function openNotification(data: Record<string, unknown> | undefined) { if (!data) return; if (typeof data.feedItemId === "string") router.push(`/article/${data.feedItemId}`); else if (typeof data.reportId === "string") router.push(`/report/${data.reportId}`); else if (typeof data.taskId === "string") router.push({ pathname: "/(tabs)/learning", params: { taskId: data.taskId } }); }
export function listenForNotificationRoutes() { void Notifications.getLastNotificationResponseAsync().then((response) => openNotification(response?.notification.request.content.data)); const subscription = Notifications.addNotificationResponseReceivedListener((response) => openNotification(response.notification.request.content.data)); return () => subscription.remove(); }
