"use client";

import { useState } from "react";

export function RegenerateButton({ stale }: { stale: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function regenerate() {
    setLoading(true); setMessage("");
    const response = await fetch("/api/learning/path/regenerate", { method: "POST" });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(result.error || "生成失败");
    setMessage("路线已更新"); window.location.reload();
  }
  return <div className="regenerate-control"><button type="button" className={stale ? "" : "secondary"} disabled={loading} onClick={regenerate}>{loading ? "规划中..." : stale ? "根据新目标重新规划" : "重新规划路线"}</button>{message && <small>{message}</small>}</div>;
}
