import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETTINGS, purgeOffline, readOffline, saveOffline } from "../src/storage";
import type { ArticleDetail } from "../src/types";

const article = (id: string): ArticleDetail => ({ id, eventId: `event-${id}`, title: `Article ${id}`, topic: "AI", summary: "summary", confidence: 0.9, bookmarked: false, publishedAt: new Date().toISOString() });
beforeEach(() => AsyncStorage.clear());
test("offline cache replaces duplicate articles", async () => { await saveOffline(article("1")); await saveOffline({ ...article("1"), title: "Updated" }); expect(await readOffline()).toHaveLength(1); expect((await readOffline())[0].title).toBe("Updated"); });
test("offline cache removes expired entries", async () => { await AsyncStorage.setItem("zhixian.offline.v2", JSON.stringify([{ ...article("old"), cachedAt: "2020-01-01T00:00:00.000Z" }])); expect(await purgeOffline({ ...DEFAULT_SETTINGS, cacheTtlDays: 1 })).toEqual([]); });
