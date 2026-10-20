import type { Metadata } from "next";
import { InstallClient } from "./install-client";

export const metadata: Metadata = {
  title: "安装知线 · 多平台下载",
  description: "选择 Windows、macOS、Linux、Android 或 iPhone/iPad，查看知线网页版应用的安装方式与客户端下载进度。",
};

export default function InstallPage() {
  return <InstallClient />;
}
