import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { request } from "../src/api";
import { enqueueMutation, flushQueue, pullSync, retryFailedMutations } from "../src/sync";
import { clearUserStorage, commitSync, getUserStorageGeneration, readQueue, readSyncCursor, updateQueue } from "../src/storage";

jest.mock("../src/api", () => ({ request: jest.fn() }));
jest.mock("../src/telemetry", () => ({ track: jest.fn() }));
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn().mockResolvedValue("device-test"), deleteItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock("@react-native-community/netinfo", () => ({ fetch: jest.fn(), addEventListener: jest.fn() }));
const call = request as jest.Mock;
const connection = NetInfo.fetch as jest.Mock;
const snapshot = { bookmarks: [], reads: [], paths: [], tasks: [] };
beforeEach(async () => { await clearUserStorage(); await AsyncStorage.clear(); jest.clearAllMocks(); connection.mockResolvedValue({ isConnected: false }); });

test("concurrent offline actions remain distinct and persisted across module reload", async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => enqueueMutation("bookmark", `item-${i % 2}`, { bookmarked: i % 2 === 0 })));
  const before = await readQueue(); expect(before).toHaveLength(12); expect(new Set(before.map((item) => item.id)).size).toBe(12);
  let restored!: ReturnType<typeof readQueue>;
  jest.isolateModules(() => {
    jest.doMock("@react-native-async-storage/async-storage", () => AsyncStorage);
    const storage = require("../src/storage") as typeof import("../src/storage");
    expect(storage.getUserStorageGeneration()).toBe(0);
    restored = storage.readQueue();
  });
  expect(await restored).toEqual(before);
  expect(JSON.parse((await AsyncStorage.getItem("zhixian.mutationQueue"))!)).toEqual(before);
});

test("a delayed flush never overwrites a newly enqueued operation; flush is single-flight", async () => {
  await enqueueMutation("bookmark", "first", { bookmarked: true });
  connection.mockResolvedValue({ isConnected: true });
  let finish!: (value: Response) => void;
  call.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const running = flushQueue();
  while (!finish) await Promise.resolve();
  const added = enqueueMutation("read", "second", { read: true });
  while ((await readQueue()).length < 2) await Promise.resolve();
  expect(flushQueue()).toBe(running);
  finish(new Response(null, { status: 200 }));
  await Promise.all([running, added]);
  expect((await readQueue()).map((item) => item.resourceId)).toEqual(["second"]);
  call.mockResolvedValue(new Response(null, { status: 200 })); await flushQueue(); expect(await readQueue()).toEqual([]);
});

test("401 and permanent failures remain visible; five server failures never drop an operation", async () => {
  await enqueueMutation("read", "auth", { read: true }); connection.mockResolvedValue({ isConnected: true });
  call.mockResolvedValue(new Response(null, { status: 401 })); await flushQueue();
  expect(await readQueue()).toEqual([expect.objectContaining({ status: "auth", attempts: 0 })]);
  call.mockResolvedValue(new Response(null, { status: 503 }));
  for (let i = 0; i < 6; i++) await flushQueue();
  expect(await readQueue()).toEqual([expect.objectContaining({ status: "failed", attempts: 5 })]);
  call.mockResolvedValue(new Response(null, { status: 400 })); await retryFailedMutations();
  expect(await readQueue()).toEqual([expect.objectContaining({ status: "failed", attempts: 1 })]);
  call.mockResolvedValue(new Response(null, { status: 200 })); await retryFailedMutations(); expect(await readQueue()).toEqual([]);
});

test("pulls share one flight, never regress a cursor, and logout fences late writes", async () => {
  let finish!: (value: Response) => void;
  call.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = pullSync(); const second = pullSync(); expect(second).toBe(first);
  while (!finish) await Promise.resolve();
  finish(new Response(JSON.stringify({ snapshot, cursor: "9", changes: [], hasMore: false })));
  await first; expect(await readSyncCursor()).toBe("9");
  expect(await commitSync(snapshot, "8", getUserStorageGeneration())).toBe(false); expect(await readSyncCursor()).toBe("9");
  const old = getUserStorageGeneration(); await clearUserStorage();
  expect(await commitSync(snapshot, "10", old)).toBe(false);
  await updateQueue(() => [{ id: "late", resource: "read", resourceId: "old-user", value: {}, changedAt: new Date().toISOString(), attempts: 0 }], old);
  expect(await readQueue()).toEqual([]); expect(await readSyncCursor()).toBe("0");
});
