import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import Settings from "../app/(tabs)/settings";
import { registerPush } from "../src/notifications";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({}));
jest.mock("../src/auth-context", () => ({ useAuth: () => ({ logout: jest.fn() }) }));
jest.mock("../src/notifications", () => ({ registerPush: jest.fn() }));
jest.mock("../src/api", () => ({ request: jest.fn() }));
jest.mock("../src/sync", () => ({ retryFailedMutations: jest.fn() }));
jest.mock("../src/storage", () => ({
  DEFAULT_SETTINGS: { fontScale: 1, speechRate: 1, notifications: { digest: true, learning: true }, cacheLimitMb: 50, cacheTtlDays: 7 },
  readSettings: jest.fn(async () => ({ fontScale: 1, speechRate: 1, notifications: { digest: true, learning: true }, cacheLimitMb: 50, cacheTtlDays: 7 })),
  offlineSizeBytes: jest.fn(async () => 0), readQueue: jest.fn(async () => []),
}));

test("push registration disables duplicate presses, shows failure and allows retry", async () => {
  let fail!: (reason: Error) => void;
  jest.mocked(registerPush).mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  const view = render(<Settings />);
  await waitFor(() => expect(view.getByText("已用 0.00 MB · 上限 50 MB · 7 天过期")).toBeTruthy());
  fireEvent.press(view.getByRole("button", { name: "注册设备推送" }));
  const busy = view.getByRole("button", { name: "正在注册…" });
  expect(busy.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(busy);
  expect(registerPush).toHaveBeenCalledTimes(1);
  await act(async () => { fail(new Error("请检查网络后重试")); });
  expect(view.getByText("请检查网络后重试")).toBeTruthy();
  jest.mocked(registerPush).mockResolvedValueOnce("ExponentPushToken[test]");
  fireEvent.press(view.getByRole("button", { name: "注册设备推送" }));
  await waitFor(() => expect(view.getByText("推送已开启")).toBeTruthy());
  expect(view.queryByText("请检查网络后重试")).toBeNull();
  expect(registerPush).toHaveBeenCalledTimes(2);
});
