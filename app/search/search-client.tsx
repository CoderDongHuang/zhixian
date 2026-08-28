"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";

type SearchItem = { id: string; kind: "event" | "entity"; title: string; summary?: string | null; topic?: string | null; type?: string; href: string };
export function SearchClient() {
  const [query, setQuery] = useState(""); const [items, setItems] = useState<SearchItem[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error("搜索服务暂时不可用，请稍后重试");
      setItems(data.items || []);
    } catch (reason) {
      setItems([]); setError(reason instanceof Error ? reason.message : "搜索服务暂时不可用，请稍后重试");
    } finally {
      setLoading(false);
    }
  }
  return <><form className="search-form" onSubmit={search}><input aria-label="搜索词" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入公司、人物、技术或事件"/><button disabled={loading}>{loading ? "搜索中..." : "搜索"}</button></form>{error ? <p className="empty-state" role="alert">{error}</p> : loading ? <p className="empty-state">正在搜索...</p> : <section className="library-list">{items.map((item) => <article key={`${item.kind}-${item.id}`}><div><span>{item.kind === "entity" ? "实体" : "事件"}</span><span>{item.type || item.topic}</span></div><h2><Link href={item.href}>{item.title}</Link></h2><p>{item.summary}</p></article>)}</section>}</>;
}
