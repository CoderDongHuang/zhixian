import { fireEvent, render, waitFor } from "@testing-library/react-native";
import Feed from "../app/(tabs)/feed";
import { request } from "../src/api";
import { readFeed } from "../src/storage";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock("../src/api", () => ({ request: jest.fn() }));
jest.mock("../src/storage", () => ({ readFeed: jest.fn(), writeFeed: jest.fn() }));
jest.mock("../src/sync", () => ({ enqueueMutation: jest.fn(), flushQueue: jest.fn() }));
jest.mock("../src/telemetry", () => ({ track: jest.fn() }));

test("feed: network and cache failures release loading and allow recovery", async () => {
  (request as jest.Mock).mockRejectedValueOnce(new Error("network"));
  (readFeed as jest.Mock).mockRejectedValueOnce(new Error("storage"));
  const view = render(<Feed />);
  await waitFor(() => expect(view.getByText("内容读取失败，请检查网络与存储空间后重试。")).toBeTruthy());
  (request as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: "feed-1", title: "恢复后的信息流", summary: "摘要", confidence: 0.9 }] }) });
  fireEvent.press(view.getByRole("button", { name: "重新加载" }));
  await waitFor(() => expect(view.getByText("恢复后的信息流")).toBeTruthy());
});
