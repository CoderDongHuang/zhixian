import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { request } from "../../src/api";
import { useTheme } from "../../src/theme";
import { PrimaryButton, Screen } from "../../src/ui";

type ReportData = { topic?: string; title: string; whyImportant?: string; learnerAdvice?: string };
export default function Report() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    async function load() {
      try {
        if (!id) throw new Error("报告链接无效");
        const response = await request(`/api/mini/reports/${id}`);
        if (!response.ok) throw new Error(response.status === 404 ? "报告不存在或已撤回" : "报告暂时无法加载，请稍后重试");
        const result = await response.json();
        if (!result?.title) throw new Error("报告内容暂时不可用");
        if (active) setData(result);
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "请检查网络后重试"); }
    }
    void load(); return () => { active = false; };
  }, [id, attempt]);
  if (!data) return <Screen>{error ? <View style={styles.content}><Text accessibilityLiveRegion="polite" style={{ color: c.muted }}>{error}</Text><PrimaryButton label="重新加载报告" variant="secondary" onPress={() => setAttempt(value => value + 1)} /></View> : <ActivityIndicator accessibilityLabel="报告加载中" color={c.primary} style={{ flex: 1 }} />}</Screen>;
  return <Screen><ScrollView contentContainerStyle={styles.content}><Text style={[styles.topic, { color: c.primary }]}>报告试读 · {data.topic || "AI 行业"}</Text><Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{data.title}</Text><Text style={[styles.heading, { color: c.text }]}>为什么重要</Text><Text style={[styles.body, { color: c.text }]}>{data.whyImportant || "暂无分析"}</Text><Text style={[styles.heading, { color: c.text }]}>学习建议</Text><Text style={[styles.body, { color: c.text }]}>{data.learnerAdvice || "暂无建议"}</Text></ScrollView></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 24, paddingBottom: 48, maxWidth: 760, width: "100%", alignSelf: "center" }, topic: { fontWeight: "600", fontSize: 12 }, title: { fontSize: 27, lineHeight: 38, fontWeight: "700", marginTop: 16 }, heading: { fontSize: 19, fontWeight: "700", marginTop: 28 }, body: { fontSize: 16, lineHeight: 28, marginTop: 12 } });
