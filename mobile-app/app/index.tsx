import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth-context";
import { PrimaryButton, Screen } from "../src/ui";
import { useTheme } from "../src/theme";
export default function Index() { const auth = useAuth(); const c = useTheme(); if (auth.loading) return <Screen><ActivityIndicator style={{ flex: 1 }}/></Screen>; if (auth.error) return <Screen><View style={{ flex: 1, justifyContent: "center", padding: 28 }}><Text accessibilityLiveRegion="polite" style={{ color: c.text }}>{auth.error}</Text><PrimaryButton label="重新检查登录状态" onPress={() => { void auth.refresh(); }}/></View></Screen>; if (!auth.signedIn) return <Redirect href="/login"/>; if (auth.locked) return <Redirect href="/locked"/>; return <Redirect href="/(tabs)/feed"/>; }
