jest.mock("expo-constants", () => ({ __esModule: true, default: { easConfig: { projectId: "test-project" } } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/api", () => ({ request: jest.fn(async () => ({ ok: true })) }));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[test]" })),
}));
import * as Notifications from "expo-notifications";
import { registerPush } from "../src/notifications";
import { request } from "../src/api";
import { Platform } from "react-native";

beforeEach(() => { jest.clearAllMocks(); Object.assign(Platform, { OS: "android" }); });
afterEach(() => jest.useRealTimers());
test("Android creates its channel before requesting permission and uses the built project ID", async () => {
  await expect(registerPush()).resolves.toBe("ExponentPushToken[test]");
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith("default", expect.any(Object));
  expect(jest.mocked(Notifications.setNotificationChannelAsync).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(Notifications.requestPermissionsAsync).mock.invocationCallOrder[0]);
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "test-project" });
  expect(request).toHaveBeenCalledWith("/api/mobile/push/subscribe", expect.objectContaining({ method: "POST" }));
});
test("denied permissions never register a token with the server", async () => {
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce({ granted: false } as Notifications.NotificationPermissionsStatus);
  await expect(registerPush()).rejects.toThrow("未获得通知权限");
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test("native token failure gives recovery steps without exposing native errors", async () => {
  jest.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValueOnce(new Error("SERVICE_NOT_AVAILABLE private details"));
  await expect(registerPush()).rejects.toThrow("Google 基础服务");
  expect(request).not.toHaveBeenCalled();
});

test("a stalled native token request times out and a late token never subscribes", async () => {
  jest.useFakeTimers();
  let resolveToken!: (value: Notifications.ExpoPushToken) => void;
  jest.mocked(Notifications.getExpoPushTokenAsync).mockReturnValueOnce(new Promise((resolve) => { resolveToken = resolve; }));
  const result = expect(registerPush()).rejects.toThrow("暂时无法连接推送服务");
  await jest.advanceTimersByTimeAsync(20_000);
  await result;
  resolveToken({ type: "expo", data: "ExponentPushToken[late]" });
  await jest.advanceTimersByTimeAsync(1);
  expect(request).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("an expired server session asks for login instead of reporting success", async () => {
  jest.mocked(request).mockResolvedValueOnce({ ok: false, status: 401 } as Response);
  await expect(registerPush()).rejects.toThrow("登录已失效");
});

test("iOS token failures give network guidance appropriate to iPhone and iPad", async () => {
  Object.assign(Platform, { OS: "ios" });
  jest.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValueOnce(new Error("APNs unavailable"));
  await expect(registerPush()).rejects.toThrow("暂时无法连接推送服务，请检查网络后重试");
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
