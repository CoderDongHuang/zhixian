import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import Report from "../app/report/[id]";
import Article from "../app/article/[id]";
import { request } from "../src/api";
import { readOffline, readSettings, removeOffline } from "../src/storage";

jest.setTimeout(15000);

let mockId = "detail-1";
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock("../src/api", () => ({ request: jest.fn() }));
jest.mock("../src/storage", () => ({ readOffline: jest.fn(), readSettings: jest.fn(), saveOffline: jest.fn(), removeOffline: jest.fn() }));
jest.mock("../src/sync", () => ({ enqueueMutation: jest.fn() }));
jest.mock("../src/telemetry", () => ({ track: jest.fn() }));
jest.mock("expo-speech", () => ({ stop: jest.fn(), speak: jest.fn() }));
const call = request as jest.Mock;
beforeEach(() => {
  jest.resetAllMocks(); mockId = "detail-1";
  (readOffline as jest.Mock).mockResolvedValue([]);
  (readSettings as jest.Mock).mockResolvedValue({ fontScale: 1, speechRate: 1 });
});
const result = { id: "detail-1", title: "恢复后的真实响应", summary: "内容" };
for (const [name, Component, button] of [["report", Report, "重新加载报告"], ["article", Article, "重新加载文章"]] as const) {
  for (const failure of ["network", "http", "json"] as const) {
    test(`${name}: ${failure} failure releases loading and permits same-page retry`, async () => {
      if (failure === "network") call.mockRejectedValueOnce(new Error("网络连接失败"));
      else if (failure === "http") call.mockResolvedValueOnce({ ok: false, status: 503 });
      else call.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("响应无效"); } });
      call.mockResolvedValueOnce({ ok: true, json: async () => result });
      const view = render(<Component />);
      await waitFor(() => expect(view.getByRole("button", { name: button })).toBeTruthy());
      fireEvent.press(view.getByRole("button", { name: button }));
      await waitFor(() => expect(view.getByText(result.title)).toBeTruthy());
      expect(call).toHaveBeenCalledTimes(2);
    });
  }
}
test("article: confirmed withdrawal hides old cached text", async () => {
  (readOffline as jest.Mock).mockResolvedValue([{ ...result, title: "已撤回的旧缓存" }]);
  call.mockResolvedValue({ ok: false, status: 404 });
  const view = render(<Article />);
  await waitFor(() => expect(view.getByText("文章不存在或已撤回")).toBeTruthy());
  expect(view.queryByText("已撤回的旧缓存")).toBeNull();
  expect(removeOffline).toHaveBeenCalledWith("detail-1");
});
test("article: network failure keeps cached reading available", async () => {
  (readOffline as jest.Mock).mockResolvedValue([result]);
  call.mockRejectedValue(new Error("断网"));
  const view = render(<Article />);
  await waitFor(() => expect(view.getByText("网络暂时不可用，正在显示离线内容")).toBeTruthy());
  expect(view.getByText(result.title)).toBeTruthy();
});
test("report: a late response for the previous route never replaces the current report", async () => {
  let finish!: (value: unknown) => void;
  call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  call.mockResolvedValueOnce({ ok: true, json: async () => ({ title: "当前报告" }) });
  const view = render(<Report />);
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  mockId = "detail-2"; view.rerender(<Report />);
  await waitFor(() => expect(view.getByText("当前报告")).toBeTruthy());
  await act(async () => { finish({ ok: true, json: async () => ({ title: "迟到的旧报告" }) }); });
  expect(view.queryByText("迟到的旧报告")).toBeNull();
  expect(view.getByText("当前报告")).toBeTruthy();
});
