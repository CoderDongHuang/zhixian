import { useCallback, useState } from "react";
import { useFocusEffect, router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { readOffline, removeOffline } from "../../src/storage";
import { useTheme } from "../../src/theme";
import type { ArticleDetail } from "../../src/types";
import { Empty, Screen, s } from "../../src/ui";
export default function Offline() { const c = useTheme(); const [items, setItems] = useState<ArticleDetail[]>([]); const load = useCallback(() => { void readOffline().then(setItems); }, []); useFocusEffect(load); async function remove(id: string) { await removeOffline(id); load(); } return <Screen><FlatList data={items} contentContainerStyle={{ flexGrow: 1 }} keyExtractor={(item) => item.id} ListEmptyComponent={<Empty>还没有离线内容</Empty>} renderItem={({ item }) => <View style={[s.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}><Pressable accessibilityRole="button" onPress={() => router.push(`/article/${item.id}`)}><Text style={[s.meta, { color: c.primary }]}>{item.topic}</Text><Text style={[s.title, { color: c.text }]}>{item.title}</Text><Text style={[s.body, { color: c.muted }]}>{item.cachedAt ? `保存于 ${new Date(item.cachedAt).toLocaleDateString()}` : "已保存"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`移除 ${item.title}`} onPress={() => remove(item.id)}><Text style={{ color: c.danger, fontWeight: "600", paddingTop: 12 }}>移除下载</Text></Pressable></View>}/></Screen>; }
