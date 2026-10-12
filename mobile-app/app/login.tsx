import { useState } from "react";
import { router } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { requestCode, verifyCode } from "../src/api";
import { useAuth } from "../src/auth-context";
import { useTheme } from "../src/theme";
import { PrimaryButton, Screen } from "../src/ui";

export default function Login() {
  const c = useTheme(); const auth = useAuth();
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (!sent) {
        const response = await requestCode(email.trim().toLowerCase());
        if (!response.ok) throw new Error("验证码发送失败，请检查邮箱后重试");
        setSent(true); setMessage("验证码已发送，请查看邮箱");
      } else {
        const response = await verifyCode(email.trim().toLowerCase(), code.trim());
        if (!response.ok) throw new Error("验证码错误或已过期，请重试或重新获取");
        await auth.refresh(); router.replace("/(tabs)/feed");
      }
    } catch { setMessage(sent ? "登录未完成，请检查网络或重新获取验证码" : "验证码发送未完成，请检查邮箱与网络后重试"); }
    finally { setBusy(false); }
  }
  return <Screen><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.brand, { color: c.primary }]}>知线</Text>
      <Text style={[styles.heading, { color: c.text }]}>登录，接续你的研究</Text>
      <Text style={{ color: c.muted, lineHeight: 24 }}>同步收藏、阅读记录与每日学习任务。</Text>
      <TextInput accessibilityLabel="邮箱" editable={!sent && !busy} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="邮箱" placeholderTextColor={c.muted} value={email} onChangeText={setEmail} style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} />
      {sent && <TextInput accessibilityLabel="验证码" editable={!busy} keyboardType="number-pad" maxLength={6} placeholder="6 位验证码" placeholderTextColor={c.muted} value={code} onChangeText={setCode} style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} />}
      <PrimaryButton label={busy ? "处理中..." : sent ? "登录" : "获取验证码"} disabled={busy || !email.trim() || (sent && !/^\d{6}$/.test(code))} onPress={submit} />
      {sent && <PrimaryButton variant="secondary" label="重新获取验证码" disabled={busy} onPress={() => { setSent(false); setCode(""); setMessage("请确认邮箱后再次获取验证码"); }} />}
      {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: c.text }]}>{message}</Text> : null}
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: 28, paddingVertical: 48, justifyContent: "center", maxWidth: 560, width: "100%", alignSelf: "center" },
  brand: { fontSize: 30, fontWeight: "700" }, heading: { fontSize: 24, lineHeight: 34, fontWeight: "700", marginTop: 28, marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, marginTop: 16 },
  message: { paddingVertical: 16, lineHeight: 24 },
});
