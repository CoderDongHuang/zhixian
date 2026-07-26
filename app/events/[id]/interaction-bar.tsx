"use client";

import { useState } from "react";

export function InteractionBar({ feedItemId, initialBookmarked }: { feedItemId: string; initialBookmarked: boolean }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [message, setMessage] = useState("");
  const [reporting, setReporting] = useState(false);

  async function toggleBookmark() {
    const response = await fetch(`/api/feed/${feedItemId}/bookmark`, { method: bookmarked ? "DELETE" : "POST" });
    if (response.ok) setBookmarked(!bookmarked); else setMessage("收藏操作失败");
  }
  async function sendHelpful(helpful: boolean) {
    const response = await fetch(`/api/feed/${feedItemId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ helpful }) });
    setMessage(response.ok ? "反馈已记录" : "反馈提交失败");
  }
  async function sendReport(formData: FormData) {
    const report = String(formData.get("report") || "");
    const response = await fetch(`/api/feed/${feedItemId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report }) });
    if (response.ok) { setMessage("问题已记录"); setReporting(false); } else setMessage("问题提交失败");
  }

  return <aside className="interaction-bar"><button className="secondary" onClick={toggleBookmark}>{bookmarked ? "已收藏" : "收藏"}</button><span>这条分析有帮助吗？</span><button className="secondary" onClick={() => sendHelpful(true)}>有帮助</button><button className="secondary" onClick={() => sendHelpful(false)}>没帮助</button><button className="text-button" onClick={() => setReporting(!reporting)}>报告问题</button>
    {reporting && <form action={sendReport}><textarea name="report" required maxLength={1000} placeholder="请描述事实错误、翻译问题或不相关内容" /><button type="submit">提交</button></form>}{message && <small>{message}</small>}</aside>;
}
