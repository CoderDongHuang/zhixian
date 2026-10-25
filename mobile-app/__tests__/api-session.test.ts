import { ApiRequestError, clearAccessToken, request } from "../src/api";
import { clearRefreshToken, setRefreshToken } from "../src/storage";

jest.mock("../src/storage", () => ({
  getRefreshToken: jest.fn(async () => "stored-refresh"), getDeviceId: jest.fn(async () => "test-device"),
  clearRefreshToken: jest.fn(), setRefreshToken: jest.fn(),
}));
const originalFetch = global.fetch;
beforeEach(() => { jest.clearAllMocks(); clearAccessToken(); global.fetch = jest.fn(); });
afterAll(() => { global.fetch = originalFetch; });

test("a transient refresh failure preserves the session and can recover", async () => {
  jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
  await expect(request("/api/mini/feed")).rejects.toBeInstanceOf(ApiRequestError);
  expect(clearRefreshToken).not.toHaveBeenCalled();
  jest.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: "new-access", refreshToken: "new-refresh" }) } as Response);
  jest.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200 } as Response);
  expect((await request("/api/mini/feed")).ok).toBe(true);
  expect(setRefreshToken).toHaveBeenCalledWith("new-refresh");
  expect(jest.mocked(fetch).mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer new-access" });
});

test.each([401, 403])("rejected refresh (%s) clears the local session", async status => {
  jest.mocked(fetch).mockResolvedValue({ ok: false, status } as Response);
  expect((await request("/api/mini/feed", {}, false)).status).toBe(status);
  expect(clearRefreshToken).toHaveBeenCalledTimes(1);
});
