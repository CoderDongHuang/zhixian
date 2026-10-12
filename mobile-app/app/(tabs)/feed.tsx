import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { FlatList, Image, Pressable, RefreshControl, Text, View } from "react-native";
import { request } from "../../src/api";
import { readFeed, writeFeed } from "../../src/storage";
import { enqueueMutation, flushQueue } from "../../src/sync";
import { track } from "../../src/telemetry";
import { useTheme } from "../../src/theme";
import type { FeedItem } from "../../src/types";
import { Empty, PageIntro, PrimaryButton, Screen, s } from "../../src/ui";

export default function Feed() {
  const c = useTheme();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    setLoading(true); setMessage("");
    try {
      await flushQueue();
      const response = await request("/api/mini/feed");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setItems(data.items || []); await writeFeed(data.items || []); void track("feed_refresh");
    } catch {
      try { setItems(await readFeed()); setMessage("未能更新，已显示本机缓存。请检查网络后重试。"); }
      catch { setMessage("内容读取失败，请检查网络与存储空间后重试。"); }
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useFocusEffect(useCallback(() => { void readFeed().then(setItems).catch(() => setMessage("缓存读取失败，请下拉刷新重试。")); }, []));
  function open(item: FeedItem) {
    void enqueueMutation("read", item.id, { read: true }).catch(() => setMessage("阅读记录未保存，请稍后重试。"));
    void track("article_open", { topic: item.topic || "" }); router.push(`/article/${item.id}`);
  }
  return <Screen><FlatList data={items} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24, maxWidth: 760, width: "100%", alignSelf: "center" }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={c.primary} />} keyExtractor={item => item.id}
    ListHeaderComponent={<><PageIntro title="值得关注的变化" description="从行业变化出发，用来源和证据建立判断。" />{message ? <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}><Text accessibilityLiveRegion="polite" style={{ color: c.muted }}>{message}</Text><PrimaryButton label="重新加载" variant="secondary" disabled={loading} onPress={refresh} /></View> : null}</>}
    ListEmptyComponent={<Empty>{loading ? "正在更新信息流…" : "暂无内容，下拉刷新或稍后再来。"}</Empty>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`阅读 ${item.title}`} onPress={() => open(item)} style={({ pressed }) => [s.row, { backgroundColor: c.surface, borderBottomColor: c.border }, pressed && { opacity: 0.8 }]}>
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} accessibilityIgnoresInvertColors style={{ width: "100%", aspectRatio: 16 / 9, marginBottom: 14, borderRadius: 8 }} resizeMode="cover" /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}><Text style={[s.meta, { color: c.primary }]}>{item.topic || "AI 行业"}</Text><Text style={[s.meta, { color: c.muted }]}>可信度 {Math.round(item.confidence * 100)}%</Text></View>
      <Text style={[s.title, { color: c.text }]}>{item.title}</Text><Text numberOfLines={3} style={[s.body, { color: c.muted }]}>{item.summary}</Text>
      <Text style={[s.meta, { color: c.primary, marginTop: 16 }]}>{item.bookmarked ? "已收藏 · 阅读分析 →" : "阅读分析 →"}</Text>
    </Pressable>} /></Screen>;
}
