import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Speech from "expo-speech";
import { request } from "../../src/api";
import { enqueueMutation } from "../../src/sync";
import { readOffline, readSettings, removeOffline, saveOffline } from "../../src/storage";
import { track } from "../../src/telemetry";
import { useTheme } from "../../src/theme";
import type { AppSettings, ArticleDetail } from "../../src/types";
import { PrimaryButton, Screen } from "../../src/ui";

export default function Article() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ArticleDetail | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setItem(null); setMessage(""); setLoading(true); setSpeaking(false);
    async function load() {
      let cached: ArticleDetail | undefined;
      try {
        if (!id) throw new Error("文章链接无效");
        const [nextSettings, offline] = await Promise.all([readSettings(), readOffline()]);
        if (!active) return;
        setSettings(nextSettings);
        cached = offline.find(value => value.id === id);
        if (cached) setItem(cached);
        const response = await request(`/api/mobile/articles/${id}`, { signal: controller.signal });
        if (!response.ok) {
          // Withdrawn content must not remain visible from an old offline copy.
          if (response.status === 404 || response.status === 410) {
            cached = undefined;
            if (active) setItem(null);
            await removeOffline(id);
            throw new Error("文章不存在或已撤回");
          }
          throw new Error("文章暂时无法加载，请稍后重试");
        }
        const result = await response.json();
        if (!result?.id || !result?.title) throw new Error("文章内容暂时不可用");
        if (active) setItem(result);
      } catch (error) {
        if (active) setMessage(cached ? "网络暂时不可用，正在显示离线内容" : error instanceof Error ? error.message : "请检查网络后重试");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); void Speech.stop(); };
  }, [id, attempt]);
  async function bookmark() {
    if (!item) return;
    const before = item;
    const bookmarked = !item.bookmarked;
    setItem({ ...item, bookmarked });
    try { await enqueueMutation("bookmark", item.id, { bookmarked }); }
    catch { setItem(before); setMessage("收藏未保存，请重试"); }
  }
  async function download() {
    if (!item || !settings) return;
    try { await saveOffline(item, settings); setMessage("已保存，可离线阅读"); void track("offline_save", { topic: item.topic || "" }); }
    catch { setMessage("离线保存失败，请检查存储空间后重试"); }
  }
  function speak() {
    if (!item || !settings) return;
    if (speaking) { void Speech.stop(); setSpeaking(false); return; }
    Speech.speak([item.title, item.summary, item.whyImportant, item.learnerAdvice].filter(Boolean).join("。"), {
      language: "zh-CN", rate: settings.speechRate,
      onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false),
      onError: () => { setSpeaking(false); setMessage("语音暂时不可用，请重试"); },
    });
    setSpeaking(true);
  }
  function progress(event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const value = Math.max(0, Math.min(100, Math.round((contentOffset.y / Math.max(1, contentSize.height - layoutMeasurement.height)) * 100)));
    if (value > 0 && value % 20 === 0) void enqueueMutation("read", id, { read: true, progress: value }).catch(() => setMessage("阅读进度未保存，请稍后重试"));
  }
  if (!item) return <Screen>{loading ? <ActivityIndicator accessibilityLabel="文章加载中" color={c.primary} style={{ flex: 1 }} /> : <View style={styles.content}><Text accessibilityLiveRegion="polite" style={{ color: c.muted }}>{message}</Text><PrimaryButton label="重新加载文章" variant="secondary" onPress={() => setAttempt(value => value + 1)} /></View>}</Screen>;
  const scale = settings?.fontScale || 1;
  return <Screen><ScrollView scrollEventThrottle={500} onScroll={progress} contentContainerStyle={styles.content}>
    {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" /> : null}
    <Text style={[styles.topic, { color: c.primary }]}>{item.topic || "AI 行业"}</Text>
    <Text accessibilityRole="header" style={[styles.title, { color: c.text, fontSize: 27 * scale, lineHeight: 36 * scale }]}>{item.title}</Text>
    <Text style={[styles.lead, { color: c.text, fontSize: 17 * scale, lineHeight: 29 * scale }]}>{item.summary}</Text>
    {item.whyImportant ? <Section title="为什么重要" text={item.whyImportant} scale={scale} /> : null}
    {item.learnerAdvice ? <Section title="学习建议" text={item.learnerAdvice} scale={scale} /> : null}
    {item.sources?.length ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: c.text }]}>来源</Text>{item.sources.map((source, index) => <Text key={`${source.name}-${index}`} style={{ color: c.muted, lineHeight: 24 }}>{source.name} · {source.title}</Text>)}</View> : null}
    <View style={styles.actions}>
      <PrimaryButton label={item.bookmarked ? "取消收藏" : "收藏"} onPress={bookmark} />
      <PrimaryButton label="离线保存" variant="secondary" onPress={download} />
      <PrimaryButton label={speaking ? "停止播报" : "语音播报"} variant="secondary" onPress={speak} />
    </View>
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: c.muted, marginTop: 12 }}>{message}</Text> : null}
  </ScrollView></Screen>;
}
function Section({ title, text, scale }: { title: string; text: string; scale: number }) {
  const c = useTheme();
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text><Text style={{ color: c.text, fontSize: 16 * scale, lineHeight: 27 * scale }}>{text}</Text></View>;
}
const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 48, width: "100%", maxWidth: 760, alignSelf: "center" },
  image: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, marginBottom: 18 },
  topic: { fontWeight: "600", fontSize: 13 }, title: { fontWeight: "700", marginTop: 12 },
  lead: { marginTop: 18 }, section: { marginTop: 28 },
  sectionTitle: { fontSize: 19, fontWeight: "700", marginBottom: 9 }, actions: { marginTop: 24 },
});
