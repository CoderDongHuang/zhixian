import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth-context";
import { registerBackgroundSync } from "../src/background";
import { listenForNotificationRoutes } from "../src/notifications";
import { startReconnectSync } from "../src/sync";
import { Sentry, track } from "../src/telemetry";
import { useTheme } from "../src/theme";
const launchedAt = Date.now();

function Navigation() { const c = useTheme(); const auth = useAuth(); useEffect(() => { void registerBackgroundSync().catch(() => undefined); void track("app_open", { startupMs: Date.now() - launchedAt }); const stopNotifications = listenForNotificationRoutes(); const stopNetwork = startReconnectSync(); return () => { stopNotifications(); stopNetwork(); }; }, []); useEffect(() => { if (auth.locked) router.replace("/locked"); }, [auth.locked]); return <><StatusBar style="auto"/><Stack screenOptions={{ headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, contentStyle: { backgroundColor: c.background }, headerBackButtonDisplayMode: "minimal" }}><Stack.Screen name="index" options={{ headerShown: false }}/><Stack.Screen name="login" options={{ headerShown: false }}/><Stack.Screen name="locked" options={{ headerShown: false }}/><Stack.Screen name="(tabs)" options={{ headerShown: false }}/><Stack.Screen name="article/[id]" options={{ title: "深度阅读" }}/><Stack.Screen name="report/[id]" options={{ title: "报告试读" }}/></Stack></>; }
function Root() { return <SafeAreaProvider><AuthProvider><Navigation/></AuthProvider></SafeAreaProvider>; }
export default Sentry.wrap(Root);
