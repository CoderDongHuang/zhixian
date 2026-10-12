import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { pullSync, enqueueMutation } from "../../src/sync";
import { useTheme } from "../../src/theme";
import type { LearningTask, SyncSnapshot } from "../../src/types";
import { Empty, PageIntro, PrimaryButton, Screen, s } from "../../src/ui";
export default function Learning() {
  const c = useTheme(); const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const [snapshot, setSnapshot] = useState<SyncSnapshot | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(() => {
    let active = true;
    void pullSync().then(value => { if (active) { setSnapshot(value); setError(""); } }).catch(() => { if (active) setError("任务暂时无法同步，已有内容仍保留"); });
    return () => { active = false; };
  }, []);
  useFocusEffect(load);
  async function toggle(task: LearningTask) {
    if (task.exercise || busy) return;
    setBusy(task.id);
    try {
      await enqueueMutation("learning_task", task.id, { completed: !task.completedAt });
      setSnapshot(current => current ? { ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, completedAt: item.completedAt ? null : new Date().toISOString() } : item) } : current);
      const value = await pullSync(); setSnapshot(value); setError("");
    } catch { setError("同步未完成，请在设置中查看待同步操作并重试"); }
    finally { setBusy(""); }
  }
  const path = snapshot?.paths?.[0];
  return <Screen><FlatList data={snapshot?.tasks || []} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24, maxWidth: 760, width: "100%", alignSelf: "center" }} keyExtractor={item => item.id}
    ListHeaderComponent={<><PageIntro title="每日学习" description="把行业变化转化为能实践的知识，每天前进一步。" />
      {error ? <View style={{ paddingHorizontal: 20 }}><Text accessibilityLiveRegion="polite" style={{ color: c.muted }}>{error}</Text><PrimaryButton label="重新同步任务" variant="secondary" onPress={load} /></View> : null}
      <View style={[s.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}><Text style={[s.title, { color: c.text }]}>{path?.title || "学习路线尚未生成"}</Text>
      <Text style={[s.body, { color: c.muted }]}>{path ? `${path.level} · ${path.goal} · 质量进度 ${path.progress}%` : "前往网页版设置学习目标并生成路线，随后在这里同步。"}</Text></View>
    </>}
    ListEmptyComponent={<Empty>暂无每日任务</Empty>}
    renderItem={({ item }) => <Pressable accessibilityRole={item.exercise ? "button" : "checkbox"} accessibilityState={{ ...(item.exercise ? {} : { checked: Boolean(item.completedAt) }), disabled: Boolean(item.exercise || busy) }} disabled={Boolean(item.exercise || busy)} onPress={() => toggle(item)} style={[s.row, { backgroundColor: taskId === item.id ? c.soft : c.surface, borderBottomColor: c.border }]}>
      <Text style={[s.title, { color: item.completedAt ? c.muted : c.text, textDecorationLine: item.completedAt ? "line-through" : "none" }]}>{item.title}</Text>
      <Text style={[s.body, { color: c.muted }]}>{item.description}</Text>
      <Text style={[s.meta, { color: c.primary, marginTop: 9 }]}>{busy === item.id ? "正在保存..." : item.completedAt ? `已完成${typeof item.qualityScore === "number" ? ` · ${item.qualityScore} 分` : ""}` : item.exercise ? `${item.estimatedMinutes} 分钟 · 请在网页版完成知识检查` : `${item.estimatedMinutes} 分钟 · 点击完成`}</Text>
    </Pressable>} /></Screen>;
}
