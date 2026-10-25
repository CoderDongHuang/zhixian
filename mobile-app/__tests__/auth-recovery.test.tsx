import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { AuthProvider, useAuth } from "../src/auth-context";
import { ApiRequestError, request } from "../src/api";
import { getRefreshToken, readSettings } from "../src/storage";
import Index from "../app/index";

jest.mock("expo-router", () => { const MockText = require("react-native").Text; return { Redirect: ({ href }: { href: string }) => <MockText>{href}</MockText> }; });
jest.mock("expo-local-authentication", () => ({ authenticateAsync: jest.fn() }));
jest.mock("../src/api", () => ({
  ApiRequestError: class extends Error {}, request: jest.fn(), clearAccessToken: jest.fn(),
}));
jest.mock("../src/storage", () => ({ getRefreshToken: jest.fn(), readSettings: jest.fn(), clearUserStorage: jest.fn() }));

function State() { const auth = useAuth(); return <><Text>{JSON.stringify({ loading: auth.loading, signedIn: auth.signedIn, locked: auth.locked })}</Text><Index /></>; }
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getRefreshToken).mockResolvedValue("local-session");
  jest.mocked(readSettings).mockResolvedValue({ biometricLock: false } as Awaited<ReturnType<typeof readSettings>>);
  jest.mocked(request).mockResolvedValue({ ok: true, status: 200 } as Response);
});

test("offline cold start keeps cached reading and the biometric lock", async () => {
  jest.mocked(readSettings).mockResolvedValue({ biometricLock: true } as Awaited<ReturnType<typeof readSettings>>);
  jest.mocked(request).mockRejectedValue(new ApiRequestError("network", "offline"));
  const view = render(<AuthProvider><State /></AuthProvider>);
  await waitFor(() => expect(view.getByText('/locked')).toBeTruthy());
  expect(view.getByText('{"loading":false,"signedIn":true,"locked":true}')).toBeTruthy();
});

test("no stored session returns to login without requesting protected data", async () => {
  jest.mocked(getRefreshToken).mockResolvedValue(null);
  const view = render(<AuthProvider><State /></AuthProvider>);
  await waitFor(() => expect(view.getByText('/login')).toBeTruthy());
  expect(request).not.toHaveBeenCalled();
});

test("a rejected session cannot enter cached reading", async () => {
  jest.mocked(request).mockResolvedValue({ ok: false, status: 401 } as Response);
  const view = render(<AuthProvider><State /></AuthProvider>);
  await waitFor(() => expect(view.getByText('/login')).toBeTruthy());
});

test("a token removed during failed refresh cannot enter cached reading", async () => {
  jest.mocked(getRefreshToken).mockResolvedValueOnce("old-session").mockResolvedValue(null);
  jest.mocked(request).mockRejectedValue(new ApiRequestError("network", "offline"));
  const view = render(<AuthProvider><State /></AuthProvider>);
  await waitFor(() => expect(view.getByText('/login')).toBeTruthy());
});

test("storage failures stop loading, fail closed, and expose a working retry", async () => {
  jest.mocked(readSettings).mockRejectedValueOnce(new Error("storage unavailable"));
  const view = render(<AuthProvider><State /></AuthProvider>);
  await waitFor(() => expect(view.getByText('登录状态读取失败，请重试')).toBeTruthy());
  expect(view.queryByText('/(tabs)/feed')).toBeNull();
  await act(async () => { fireEvent.press(view.getByRole('button', { name: '重新检查登录状态' })); });
  await waitFor(() => expect(view.getByText('/(tabs)/feed')).toBeTruthy());
});

test("temporary server outage preserves local reading", async () => {
  jest.mocked(request).mockResolvedValue({ ok: false, status: 503 } as Response);
  const view = render(<AuthProvider><State /></AuthProvider>);
  await waitFor(() => expect(view.getByText('/(tabs)/feed')).toBeTruthy());
});
