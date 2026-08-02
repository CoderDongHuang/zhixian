import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/auth-context";
import { useTheme } from "../src/theme";
import { PrimaryButton, Screen } from "../src/ui";
export default function Locked() { const auth = useAuth(); const c = useTheme(); async function unlock() { if (await auth.unlock()) router.replace("/(tabs)/feed"); } return <Screen><Text style={[styles.title, { color: c.text }]}>知线已锁定</Text><Text style={[styles.body, { color: c.muted }]}>请使用设备生物识别或系统密码继续。</Text><PrimaryButton label="解锁" onPress={unlock}/></Screen>; }
const styles = StyleSheet.create({ title: { marginTop: "60%", textAlign: "center", fontSize: 24, fontWeight: "700" }, body: { textAlign: "center", marginVertical: 12 } });
