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

beforeEach(() => jest.clearAllMocks());
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
