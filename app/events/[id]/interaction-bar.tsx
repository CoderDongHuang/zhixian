"use client";

import { useCallback, useEffect, useState } from "react";

export function InteractionBar({ feedItemId, eventId, topic, speechText, initialBookmarked }: { feedItemId: string; eventId: string; topic: string; speechText: string; initialBookmarked: boolean }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [message, setMessage] = useState("");
  const [reporting, setReporting] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const track = useCallback((action: string) => { fetch("/api/behavior", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, feedItemId, eventId, topic }) }).catch(() => undefined); }, [eventId, feedItemId, topic]);
  useEffect(() => { track("read"); }, [track]);

  async function toggleBookmark() {
    const response = await fetch(`/api/feed/${feedItemId}/bookmark`, { method: bookmarked ? "DELETE" : "POST" });
    if (response.ok) { setBookmarked(!bookmarked); if (!bookmarked) track("bookmark"); } else setMessage("收藏操作失败");
  }
  async function sendHelpful(helpful: boolean) {
    const response = await fetch(`/api/feed/${feedItemId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ helpful }) });
    setMessage(response.ok ? "反馈已记录" : "反馈提交失败"); if (response.ok) track(helpful ? "helpful" : "not_helpful");
  }
  async function sendReport(formData: FormData) {
    const report = String(formData.get("report") || "");
    const response = await fetch(`/api/feed/${feedItemId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report }) });
    if (response.ok) { setMessage("问题已记录"); setReporting(false); } else setMessage("问题提交失败");
  }
  function toggleSpeech() {
    if (!("speechSynthesis" in window)) return setMessage("当前设备不支持语音播报");
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(speechText); utterance.lang = "zh-CN"; utterance.rate = 1;
    utterance.onend = () => setSpeaking(false); speechSynthesis.speak(utterance); setSpeaking(true); track("listen");
  }
  async function saveOffline() {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: "CACHE_URL", url: window.location.pathname }); setMessage("已加入离线阅读");
  }
  async function share() {
    const data = { title: document.title, text: speechText.slice(0, 120), url: window.location.href };
    if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(window.location.href); setMessage("链接已复制"); }
    track("share");
  }

  return <aside className="interaction-bar"><button className="secondary" onClick={toggleBookmark}>{bookmarked ? "已收藏" : "收藏"}</button><button className="secondary" onClick={saveOffline}>离线阅读</button><button className="secondary" onClick={toggleSpeech}>{speaking ? "停止播报" : "语音播报"}</button><button className="secondary" onClick={share}>分享</button><span>这条分析有帮助吗？</span><button className="secondary" onClick={() => sendHelpful(true)}>有帮助</button><button className="secondary" onClick={() => sendHelpful(false)}>没帮助</button><button className="text-button" onClick={() => setReporting(!reporting)}>报告问题</button>
    {reporting && <form action={sendReport}><textarea name="report" required maxLength={1000} placeholder="请描述事实错误、翻译问题或不相关内容" /><button type="submit">提交</button></form>}{message && <small>{message}</small>}</aside>;
}
