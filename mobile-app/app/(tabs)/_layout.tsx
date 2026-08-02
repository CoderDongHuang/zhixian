import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTheme } from "../../src/theme";
const icon = (label: string, color: string) => <Text style={{ color, fontWeight: "800" }}>{label}</Text>;
export default function TabsLayout() { const c = useTheme(); return <Tabs screenOptions={{ headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border }, tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted }}><Tabs.Screen name="feed" options={{ title: "信息流", tabBarIcon: ({ color }) => icon("阅", color) }}/><Tabs.Screen name="offline" options={{ title: "离线", tabBarIcon: ({ color }) => icon("存", color) }}/><Tabs.Screen name="learning" options={{ title: "学习", tabBarIcon: ({ color }) => icon("学", color) }}/><Tabs.Screen name="settings" options={{ title: "设置", tabBarIcon: ({ color }) => icon("设", color) }}/></Tabs>; }
