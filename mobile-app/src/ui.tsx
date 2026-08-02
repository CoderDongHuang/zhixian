import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "./theme";
export function Screen({ children }: PropsWithChildren) { const c = useTheme(); return <View style={[s.screen, { backgroundColor: c.background }]}>{children}</View>; }
export function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) { const c = useTheme(); return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, { backgroundColor: c.primary }, disabled && { opacity: 0.5 }]}><Text style={{ color: c.surface, fontWeight: "700" }}>{label}</Text></Pressable>; }
export function Empty({ children }: PropsWithChildren) { const c = useTheme(); return <Text style={[s.empty, { color: c.muted }]}>{children}</Text>; }
export const s = StyleSheet.create({ screen: { flex: 1 }, button: { minHeight: 48, borderRadius: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, marginTop: 14 }, empty: { textAlign: "center", padding: 48, lineHeight: 22 }, row: { padding: 18, borderBottomWidth: StyleSheet.hairlineWidth }, title: { fontSize: 17, fontWeight: "700", marginTop: 6 }, body: { fontSize: 15, lineHeight: 23, marginTop: 7 }, meta: { fontSize: 13, fontWeight: "600" } });
