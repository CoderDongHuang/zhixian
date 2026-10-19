"use client";

import { useState } from "react";

export function InitializeLearningButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function initialize() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/learning/initialize", { method: "POST", signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error("initialization_failed");
      // Reload the server-rendered path, as the replan action does, so the
      // empty route cannot remain visible after a successful initialization.
      window.location.reload();
    } catch { setError("生成失败，请稍后重试"); setBusy(false); }
  }
  return <div><button onClick={initialize} disabled={busy}>{busy ? "生成中..." : "生成今日学习任务"}</button>{error && <p role="alert">{error}</p>}</div>;
}
