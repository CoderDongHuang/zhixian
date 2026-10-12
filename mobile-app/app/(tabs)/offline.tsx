import { useCallback, useState } from "react";
import { useFocusEffect, router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { readOffline, removeOffline } from "../../src/storage";
import { useTheme } from "../../src/theme";
import type { ArticleDetail } from "../../src/types";
import { Empty, PageIntro, PrimaryButton, Screen, s } from "../../src/ui";
export default function Offline() {
  const c = useTheme(); const [items, setItems] = useState<ArticleDetail[]>([]); const [error, setError] = useState("");
  const load = useCallback(() => {
    let active = true;
    void readOffline().then(value => { if (active) { setItems(value); setError(""); } }).catch(() => { if (active) setError("离线内容暂时无法读取，请重试"); });
    return () => { active = false; };
  }, []);
  useFocusEffect(load);
  async function remove(id: string) {
    try { await removeOffline(id); setItems(current => current.filter(item => item.id !== id)); setError(""); }
    catch { setError("移除失败，下载内容仍保留"); }
  }
  return <Screen><FlatList data={items} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24, maxWidth: 760, width: "100%", alignSelf: "center" }} keyExtractor={item => item.id}
    ListHeaderComponent={<><PageIntro title="离线阅读" description="保存重要内容，在没有网络时继续阅读。" />{error ? <View style={{ paddingHorizontal: 20 }}><Text accessibilityLiveRegion="polite" style={{ color: c.muted }}>{error}</Text><PrimaryButton label="重新读取" variant="secondary" onPress={load} /></View> : null}</>}
    ListEmptyComponent={<Empty>还没有离线内容。打开文章，点击“离线保存”即可添加。</Empty>}
    renderItem={({ item }) => <View style={[s.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      <Pressable accessibilityRole="button" onPress={() => router.push(`/article/${item.id}`)}>
        <Text style={[s.meta, { color: c.primary }]}>{item.topic}</Text><Text style={[s.title, { color: c.text }]}>{item.title}</Text>
        <Text style={[s.body, { color: c.muted }]}>{item.cachedAt ? `保存于 ${new Date(item.cachedAt).toLocaleDateString()}` : "已保存"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`移除 ${item.title}`} style={{ minHeight: 44, justifyContent: "center", marginTop: 8 }} onPress={() => remove(item.id)}><Text style={{ color: c.danger, fontWeight: "600" }}>移除下载</Text></Pressable>
    </View>} /></Screen>;
}
