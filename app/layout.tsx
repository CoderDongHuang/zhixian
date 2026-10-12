import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design-system.css";
import { SiteHeader } from "./site-header";
import { PwaRegistration } from "./pwa-registration";

export const metadata: Metadata = {
  title: "知线 | AI 行业研究助手",
  description: "持续追踪 AI 行业、大模型与 GitHub 开源项目的重要变化。",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><SiteHeader /><div id="page-content" tabIndex={-1}>{children}</div><PwaRegistration /></body></html>;
}
