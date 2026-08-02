import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text } from "react-native";
import { request } from "../../src/api";
import { useTheme } from "../../src/theme";
import { Screen } from "../../src/ui";
export default function Report() { const c = useTheme(); const { id } = useLocalSearchParams<{ id: string }>(); const [data, setData] = useState<Record<string, any> | null>(null); useEffect(() => { void request(`/api/mini/reports/${id}`).then((response) => response.ok ? response.json() : null).then(setData); }, [id]); if (!data) return <Screen><ActivityIndicator style={{ flex: 1 }}/></Screen>; return <Screen><ScrollView contentContainerStyle={styles.content}><Text style={[styles.topic, { color: c.primary }]}>{data.topic}</Text><Text style={[styles.title, { color: c.text }]}>{data.title}</Text><Text style={[styles.body, { color: c.text }]}>{data.whyImportant}</Text><Text style={[styles.heading, { color: c.text }]}>学习建议</Text><Text style={[styles.body, { color: c.text }]}>{data.learnerAdvice}</Text></ScrollView></Screen>; }
const styles = StyleSheet.create({ content: { padding: 24, maxWidth: 760, width: "100%", alignSelf: "center" }, topic: { fontWeight: "700" }, title: { fontSize: 27, lineHeight: 36, fontWeight: "800", marginTop: 12 }, heading: { fontSize: 19, fontWeight: "700", marginTop: 24 }, body: { fontSize: 16, lineHeight: 27, marginTop: 12 } });
