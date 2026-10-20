import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { request } from "./api";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });
export async function registerPush(categories = { digest: true, learning: true }) {
  // Android 13 needs a notification channel before the permission request.
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "知线通知", importance: Notifications.AndroidImportance.DEFAULT });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("未获得通知权限");
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error("尚未配置 EAS Project ID");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const response = await request("/api/mobile/push/subscribe", { method: "POST", body: JSON.stringify({ token, platform: Platform.OS, categories }) });
  if (!response.ok) throw new Error("推送注册失败");
  return token;
}
function openNotification(data: Record<string, unknown> | undefined) { if (!data) return; if (typeof data.feedItemId === "string") router.push(`/article/${data.feedItemId}`); else if (typeof data.reportId === "string") router.push(`/report/${data.reportId}`); else if (typeof data.taskId === "string") router.push({ pathname: "/(tabs)/learning", params: { taskId: data.taskId } }); }
export function listenForNotificationRoutes() { void Notifications.getLastNotificationResponseAsync().then((response) => openNotification(response?.notification.request.content.data)); const subscription = Notifications.addNotificationResponseReceivedListener((response) => openNotification(response.notification.request.content.data)); return () => subscription.remove(); }
