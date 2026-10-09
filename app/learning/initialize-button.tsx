"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InitializeLearningButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function initialize() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/learning/initialize", { method: "POST", signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error("initialization_failed");
      router.refresh();
    } catch { setError("生成失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  return <div><button onClick={initialize} disabled={busy}>{busy ? "生成中..." : "生成今日学习任务"}</button>{error && <p role="alert">{error}</p>}</div>;
}
