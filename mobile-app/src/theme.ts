import { useColorScheme } from "react-native";
export const light = { background: "#f5f6f7", surface: "#ffffff", text: "#202824", muted: "#606c66", border: "#dce2de", primary: "#21634b", onPrimary: "#ffffff", soft: "#edf4f0", warning: "#fff4e5", danger: "#a33a2b" };
export const dark = { background: "#141716", surface: "#1e2321", text: "#f2f5f3", muted: "#abb7b0", border: "#3b4540", primary: "#91d0b3", onPrimary: "#16271e", soft: "#253b30", warning: "#3d2f16", danger: "#ffb4a8" };
export function useTheme() { return useColorScheme() === "dark" ? dark : light; }
