import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth } from "../../src/auth-context";
import { registerPush } from "../../src/notifications";
import { clearOffline, DEFAULT_SETTINGS, offlineSizeBytes, readQueue, readSettings, writeSettings } from "../../src/storage";
import { retryFailedMutations } from "../../src/sync";
import { useTheme } from "../../src/theme";
import { request } from "../../src/api";
import type { AppSettings } from "../../src/types";
import { PageIntro, PrimaryButton, Screen } from "../../src/ui";
export default function Settings() { const c = useTheme(); const auth = useAuth(); const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS); const [bytes, setBytes] = useState(0); const [pending, setPending] = useState(0); const [failed, setFailed] = useState(0); const [syncing, setSyncing] = useState(false); const [registeringPush, setRegisteringPush] = useState(false); const [pushMessage, setPushMessage] = useState(""); const [message, setMessage] = useState(""); const [feedback, setFeedback] = useState(""); const [rating, setRating] = useState(5); const [sending, setSending] = useState(false); useEffect(() => { void Promise.all([readSettings(), offlineSizeBytes(), readQueue()]).then(([value, size, queue]) => { setSettings(value); setBytes(size); setPending(queue.length); setFailed(queue.filter((item) => item.status === "failed" || item.status === "auth").length); }).catch(() => setMessage("设置读取失败，请重新打开此页面")); }, []); async function retrySync() { setSyncing(true); try {
    const result = await retryFailedMutations();
    setPending(result.pending);
    setFailed(result.failed);
    setMessage(result.failed ? "仍有同步失败，请检查登录状态后重试" : result.pending ? "操作已保留，联网后继续同步" : "同步完成");
}
catch {
    setMessage("同步失败，操作已保留");
}
finally {
    setSyncing(false);
} } async function update(next: AppSettings) { try { await writeSettings(next); setSettings(next); } catch { setMessage("设置未保存，请检查存储空间后重试"); } } async function biometric(value: boolean) { try { if (value) {
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hardware || !enrolled)
        return setMessage("设备未配置可用的生物识别");
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "启用知线应用锁" });
    if (!result.success)
        return;
} await update({ ...settings, biometricLock: value }); } catch { setMessage("生物识别暂时不可用，请稍后重试"); } } async function push() { if (registeringPush) return; setRegisteringPush(true); setPushMessage(""); try {
    await registerPush(settings.notifications);
    setPushMessage("推送已开启");
}
catch (error) {
    setPushMessage(error instanceof Error ? error.message : "推送开启失败");
} finally { setRegisteringPush(false); } } async function clear() { try { await clearOffline(); setBytes(0); setMessage("离线缓存已清理"); } catch { setMessage("缓存清理失败，请重试"); } }
async function sendFeedback() {
  if (sending || !feedback.trim()) return;
  setSending(true);
  try {
    const response = await request("/api/mobile/feedback", { method: "POST", body: JSON.stringify({ rating, message: feedback, appVersion: "0.4.0" }) });
    if (!response.ok) throw new Error("反馈发送失败");
    setFeedback(""); setMessage("感谢反馈");
  } catch { setMessage("反馈发送失败，内容已保留，请重试"); }
  finally { setSending(false); }
}
async function logout() { try { await auth.logout(); router.replace("/login"); } catch { setMessage("退出未完成，请重试"); } }
return <Screen><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><PageIntro title="阅读与账号设置" description="按你的习惯阅读，自主控制通知与离线存储。" /><Group title="阅读"><Option label="字体大小" detail={`${Math.round(settings.fontScale * 100)}%`}><Segments values={[0.9, 1, 1.15, 1.3]} selected={settings.fontScale} onChange={(fontScale) => update({ ...settings, fontScale })}/></Option><Option label="语音速度" detail={`${settings.speechRate.toFixed(2)} 倍`}><Segments values={[0.75, 0.9, 1, 1.15]} selected={settings.speechRate} onChange={(speechRate) => update({ ...settings, speechRate })}/></Option></Group><Group title="通知"><Toggle label="行业简报" value={settings.notifications.digest} onChange={(digest) => update({ ...settings, notifications: { ...settings.notifications, digest } })}/><Toggle label="学习任务" value={settings.notifications.learning} onChange={(learning) => update({ ...settings, notifications: { ...settings.notifications, learning } })}/><PrimaryButton variant="secondary" label={registeringPush ? "正在注册…" : "注册设备推送"} disabled={registeringPush} onPress={push}/>{pushMessage ? <Text accessibilityLiveRegion="polite" style={{ color: c.primary, paddingTop: 12, lineHeight: 22 }}>{pushMessage}</Text> : null}</Group><Group title="离线存储"><Text style={{ color: c.muted, lineHeight: 22 }}>已用 {(bytes / 1024 / 1024).toFixed(2)} MB · 上限 {settings.cacheLimitMb} MB · {settings.cacheTtlDays} 天过期</Text><Text style={{ color: c.muted, marginTop: 5 }}>待同步操作：{pending} · 失败或待登录：{failed}</Text><PrimaryButton variant="secondary" label="重试同步" disabled={syncing || !pending} onPress={retrySync}/><View style={styles.row}><Segments values={[25, 50, 100]} selected={settings.cacheLimitMb} onChange={(cacheLimitMb) => update({ ...settings, cacheLimitMb })}/></View><PrimaryButton variant="secondary" label="清理离线缓存" onPress={clear}/></Group><Group title="隐私与安全"><Toggle label="生物识别应用锁" value={settings.biometricLock} onChange={biometric}/><Toggle label="匿名性能分析" value={settings.analytics} onChange={(analytics) => update({ ...settings, analytics })}/><Text style={{ color: c.muted, lineHeight: 21 }}>不会发送邮箱、阅读正文或设备标识；崩溃报告默认移除个人信息。</Text><Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }} onPress={() => { void Linking.openURL("https://zhixian.asia/privacy").catch(() => setMessage("无法打开隐私政策，请用浏览器访问 zhixian.asia/privacy")); }}><Text style={{ color: c.primary, fontWeight: "700", paddingTop: 12 }}>查看隐私政策</Text></Pressable></Group><Group title="内测反馈"><Segments values={[1, 2, 3, 4, 5]} selected={rating} onChange={setRating}/><TextInput accessibilityLabel="反馈内容" multiline maxLength={1000} value={feedback} onChangeText={setFeedback} placeholder="描述问题或建议" placeholderTextColor={c.muted} style={[styles.feedback, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}/><PrimaryButton label={sending ? "发送中..." : "发送反馈"} disabled={sending || !feedback.trim()} onPress={sendFeedback}/></Group>{message ? <Text accessibilityLiveRegion="polite" style={{ color: c.primary, paddingVertical: 12 }}>{message}</Text> : null}<Pressable accessibilityRole="button" onPress={logout} style={[styles.logout, { borderColor: c.border }]}><Text style={{ color: c.danger, fontWeight: "700" }}>退出并清除安全会话</Text></Pressable></ScrollView></Screen>; }
function Group({ title, children }: React.PropsWithChildren<{
    title: string;
}>) { const c = useTheme(); return <View style={[styles.group, { borderColor: c.border, backgroundColor: c.surface }]}><Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>{title}</Text>{children}</View>; }
function Option({ label, detail, children }: React.PropsWithChildren<{
    label: string;
    detail: string;
}>) { const c = useTheme(); return <View style={styles.option}><View><Text style={{ color: c.text, fontWeight: "600" }}>{label}</Text><Text style={{ color: c.muted, marginTop: 3 }}>{detail}</Text></View>{children}</View>; }
function Toggle({ label, value, onChange }: {
    label: string;
    value: boolean;
    onChange(value: boolean): void;
}) { const c = useTheme(); return <View style={styles.option}><Text style={{ color: c.text, fontWeight: "600", flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: c.primary }}/></View>; }
function Segments({ values, selected, onChange }: {
    values: number[];
    selected: number;
    onChange(value: number): void;
}) { const c = useTheme(); return <View style={[styles.segments, { borderColor: c.border }]}>{values.map((value) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: value === selected }} key={value} onPress={() => onChange(value)} style={[styles.segment, value === selected && { backgroundColor: c.primary }]}><Text style={{ color: value === selected ? c.onPrimary : c.text }}>{value}</Text></Pressable>)}</View>; }
const styles = StyleSheet.create({ content: { paddingBottom: 42, maxWidth: 760, width: "100%", alignSelf: "center" }, group: { padding: 20, marginHorizontal: 16, marginVertical: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth }, heading: { fontSize: 19, fontWeight: "800", marginBottom: 10 }, option: { minHeight: 58, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 8 }, row: { marginTop: 12 }, segments: { flexDirection: "row", borderWidth: 1, borderRadius: 10, overflow: "hidden" }, segment: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, feedback: { minHeight: 110, borderWidth: 1, borderRadius: 6, padding: 12, marginTop: 14, textAlignVertical: "top" }, logout: { margin: 20, minHeight: 48, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" } });
