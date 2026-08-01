import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { request } from "./api";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });
export async function registerPush() {
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("未获得通知权限");
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "行业简报", importance: Notifications.AndroidImportance.DEFAULT });
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  const response = await request("/api/mobile/push/subscribe", { method: "POST", body: JSON.stringify({ token, platform: Platform.OS }) });
  if (!response.ok) throw new Error("推送注册失败");
  return token;
}
