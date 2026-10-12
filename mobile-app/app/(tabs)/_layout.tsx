import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTheme } from "../../src/theme";
function Icon({ color, kind }: { color: string; kind: "feed" | "offline" | "learning" | "settings" }) {
  return <View accessible={false} style={{ width: 22, height: 22, borderWidth: 1.7, borderColor: color, borderRadius: kind === "settings" ? 11 : 4, padding: 4, justifyContent: "space-evenly" }}>
    {kind === "settings" ? <View style={{ width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: color, alignSelf: "center" }} /> :
    kind === "offline" ? <View style={{ width: 8, height: 10, borderColor: color, borderBottomWidth: 2, borderRightWidth: 2, transform: [{ rotate: "45deg" }], alignSelf: "center", marginTop: -4 }} /> :
    <>{[0, 1, 2].map(line => <View key={line} style={{ height: 1.5, backgroundColor: color, width: kind === "learning" && line === 2 ? "60%" : "100%" }} />)}</>}
  </View>;
}
export default function TabsLayout() {
  const c = useTheme();
  return <Tabs screenOptions={{ headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, headerShadowVisible: false,
    tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border }, tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted, tabBarLabelStyle: { fontSize: 12, fontWeight: "600" } }}>
    <Tabs.Screen name="feed" options={{ title: "发现", tabBarIcon: ({ color }) => <Icon color={color} kind="feed" /> }} />
    <Tabs.Screen name="offline" options={{ title: "离线", tabBarIcon: ({ color }) => <Icon color={color} kind="offline" /> }} />
    <Tabs.Screen name="learning" options={{ title: "学习", tabBarIcon: ({ color }) => <Icon color={color} kind="learning" /> }} />
    <Tabs.Screen name="settings" options={{ title: "设置", tabBarIcon: ({ color }) => <Icon color={color} kind="settings" /> }} />
  </Tabs>;
}
