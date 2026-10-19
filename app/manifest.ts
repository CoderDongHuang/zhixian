import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "知线 AI 行业研究助手",
    short_name: "知线",
    description: "持续追踪 AI 行业、大模型与 GitHub 开源项目的重要变化。",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#21634b",
    categories: ["news", "education", "productivity"],
    icons: [
      { src: "/icon-192.png?v=zhi-1", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=zhi-1", sizes: "512x512", type: "image/png" },
    ],
  };
}
