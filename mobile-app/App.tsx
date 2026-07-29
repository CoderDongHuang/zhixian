import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { request } from "./src/api";

type FeedItem = { id: string; title: string; topic: string; summary: string };
export default function App() {
  const [items, setItems] = useState<FeedItem[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { request("/api/mini/feed").then(async (response) => { if (response.ok) setItems((await response.json()).items || []); }).finally(() => setLoading(false)); }, []);
  return <SafeAreaView style={styles.screen}><StatusBar style="dark"/><View style={styles.header}><Text style={styles.brand}>知线</Text><Text style={styles.subtitle}>值得关注的 AI 行业变化</Text></View>{loading ? <ActivityIndicator/> : <FlatList data={items} keyExtractor={(item) => item.id} renderItem={({ item }) => <View style={styles.item}><Text style={styles.topic}>{item.topic}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.summary}>{item.summary}</Text></View>}/>}</SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "#f7f8fa" }, header: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#dfe3e8" }, brand: { fontSize: 28, fontWeight: "700", color: "#176b4d" }, subtitle: { marginTop: 6, color: "#667085" }, item: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#dfe3e8" }, topic: { color: "#176b4d", fontWeight: "600" }, title: { marginTop: 8, fontSize: 18, fontWeight: "600" }, summary: { marginTop: 8, color: "#4b5565", lineHeight: 22 } });
