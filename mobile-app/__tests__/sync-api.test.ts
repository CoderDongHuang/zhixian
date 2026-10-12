import { ApiRequestError, fetchWithPolicy } from "../src/api";
import { applySyncChanges } from "../src/sync";
import type { SyncSnapshot } from "../src/types";

// Sync policy tests must not start the native telemetry SDK's cleanup timer.
jest.mock("../src/telemetry", () => ({ track: jest.fn() }));

const snapshot: SyncSnapshot = { bookmarks: [{ feedItemId: "old" }], reads: [], paths: [{ id: "path", title: "Path", goal: "Learn", level: "beginner", progress: 0 }], tasks: [{ id: "task", pathId: "path", title: "Task", description: "", estimatedMinutes: 5, completedAt: null, scheduledFor: "2026-08-24T00:00:00.000Z" }] };

afterEach(() => jest.restoreAllMocks());

test("incremental sync applies bookmark, read, and task changes", () => {
  const result = applySyncChanges(snapshot, [
    { sequence: "1", resource: "bookmark", resourceId: "old", value: { bookmarked: false }, changedAt: "2026-08-24T00:00:01.000Z" },
    { sequence: "2", resource: "bookmark", resourceId: "new", value: { bookmarked: true }, changedAt: "2026-08-24T00:00:02.000Z" },
    { sequence: "3", resource: "read", resourceId: "new", value: { read: true }, changedAt: "2026-08-24T00:00:03.000Z" },
    { sequence: "4", resource: "learning_task", resourceId: "task", value: { completed: true, completedAt: "2026-08-24T00:00:04.000Z", pathId: "path", pathProgress: 100 }, changedAt: "2026-08-24T00:00:05.000Z" },
  ]);
  expect(result.bookmarks).toEqual([{ feedItemId: "new" }]);
  expect(result.reads).toEqual([{ feedItemId: "new" }]);
  expect(result.tasks[0].completedAt).toBe("2026-08-24T00:00:04.000Z");
  expect(result.paths[0].progress).toBe(100);
});

test("network wrapper classifies timeout and cancellation", async () => {
  jest.spyOn(global, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
  await expect(fetchWithPolicy("https://example.invalid", {}, { timeoutMs: 5 })).rejects.toMatchObject({ kind: "timeout" } satisfies Partial<ApiRequestError>);
  const controller = new AbortController(); controller.abort();
  await expect(fetchWithPolicy("https://example.invalid", { signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" } satisfies Partial<ApiRequestError>);
});

test("network wrapper retries a transient idempotent response once", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response("ok", { status: 200 }));
  const response = await fetchWithPolicy("https://example.invalid", {}, { retries: 1 });
  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
