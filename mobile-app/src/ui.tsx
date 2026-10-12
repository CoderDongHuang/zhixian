import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "./theme";
export function Screen({ children }: PropsWithChildren) { const c = useTheme(); return <View style={[s.screen, { backgroundColor: c.background }]}>{children}</View>; }
export function PrimaryButton({ label, onPress, disabled = false, variant = "primary" }: { label: string; onPress(): void; disabled?: boolean; variant?: "primary" | "secondary" }) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: variant === "primary" ? c.primary : c.surface, borderColor: variant === "primary" ? c.primary : c.border }, (disabled || pressed) && { opacity: disabled ? 0.5 : 0.8 }]}><Text style={{ color: variant === "primary" ? c.onPrimary : c.text, fontWeight: "600", fontSize: 15, textAlign: "center" }}>{label}</Text></Pressable>;
}
export function PageIntro({ title, description }: { title: string; description: string }) {
  const c = useTheme();
  return <View style={s.intro}><Text accessibilityRole="header" style={[s.heading, { color: c.text }]}>{title}</Text><Text style={[s.body, { color: c.muted }]}>{description}</Text></View>;
}
export function Empty({ children }: PropsWithChildren) { const c = useTheme(); return <Text style={[s.empty, { color: c.muted, backgroundColor: c.surface, borderColor: c.border }]}>{children}</Text>; }
export const s = StyleSheet.create({
  screen: { flex: 1 },
  button: { minHeight: 48, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 12, marginTop: 12 },
  intro: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 18 },
  heading: { fontSize: 25, lineHeight: 34, fontWeight: "700" },
  empty: { textAlign: "center", paddingHorizontal: 24, paddingVertical: 40, lineHeight: 24, margin: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  row: { padding: 20, marginHorizontal: 16, marginVertical: 6, borderRadius: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 19, lineHeight: 28, fontWeight: "700", marginTop: 10 },
  body: { fontSize: 15, lineHeight: 25, marginTop: 8 },
  meta: { fontSize: 12, lineHeight: 19, fontWeight: "600" },
});
