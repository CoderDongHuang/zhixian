import { useColorScheme } from "react-native";
export const light = { background: "#f7f8fa", surface: "#ffffff", text: "#18221e", muted: "#667085", border: "#dfe3e8", primary: "#176b4d", warning: "#fff4e5", danger: "#a33a2b" };
export const dark = { background: "#101512", surface: "#18201c", text: "#f4f7f5", muted: "#aab5af", border: "#34423b", primary: "#5ec49a", warning: "#3d2f16", danger: "#ff9c8c" };
export function useTheme() { return useColorScheme() === "dark" ? dark : light; }
