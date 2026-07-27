"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Keyword = { id: string; keyword: string; realtime: boolean; enabled: boolean };

export default function KeywordsPage() {
  const [items, setItems] = useState<Keyword[]>([]);
  const [keyword, setKeyword] = useState("");
  const [realtime, setRealtime] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/keywords");
    if (response.status === 401) { setMessage("请先登录后配置关键词提醒。"); setLoading(false); return; }
    const data = await response.json();
    setItems(Array.isArray(data) ? data : []); setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function add(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword, realtime }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "添加失败"); return; }
    setKeyword(""); setMessage(`已订阅“${data.keyword}”`); await load();
  }

  async function remove(id: string) {
    const response = await fetch(`/api/keywords?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { setMessage("删除失败"); return; }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return <main className="library-shell">
    <header><Link href="/">← 返回信息流</Link><h1>关键词提醒</h1><p>添加公司、产品、技术或开源项目名称。公开信息匹配后，系统会通过邮件提醒。</p></header>
    <form onSubmit={add} className="keyword-form">
      <label>关键词<input value={keyword} onChange={(event) => setKeyword(event.target.value)} required maxLength={100} placeholder="例如：DeepSeek、Agent、开源模型" /></label>
      <label className="keyword-realtime"><input type="checkbox" checked={realtime} onChange={(event) => setRealtime(event.target.checked)} />实时提醒</label>
      <button type="submit">添加关键词</button>
    </form>
    {message && <p className="form-message">{message}</p>}
    <section className="library-list">
      {loading ? <p className="empty-state">正在加载...</p> : items.length === 0 ? <p className="empty-state">还没有订阅关键词。</p> : items.map((item) => <article key={item.id} className="keyword-item"><div><strong>{item.keyword}</strong><span>{item.realtime ? "实时提醒" : "汇总提醒"}</span></div><button type="button" className="secondary" onClick={() => void remove(item.id)}>删除</button></article>)}
    </section>
  </main>;
}
