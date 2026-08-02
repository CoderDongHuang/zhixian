import { ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth-context";
import { Screen } from "../src/ui";
export default function Index() { const auth = useAuth(); if (auth.loading) return <Screen><ActivityIndicator style={{ flex: 1 }}/></Screen>; if (!auth.signedIn) return <Redirect href="/login"/>; if (auth.locked) return <Redirect href="/locked"/>; return <Redirect href="/(tabs)/feed"/>; }
