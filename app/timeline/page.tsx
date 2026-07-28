import { getCachedTimeline } from "@/lib/public-data";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function TimelinePage() {
  const entries = await getCachedTimeline();
  return <main className="library-shell"><header><Link href="/">← 返回信息流</Link><h1>事件时间线</h1><p>按时间查看事件及其关联变化。</p></header><section className="library-list">{entries.length === 0 ? <p className="empty-state">时间线会在事件沉淀后自动生成。</p> : entries.map((entry) => <article key={entry.id}><div><span>{entry.occurredAt.toLocaleDateString("zh-CN")}</span><span>{entry.label}</span></div><h2><Link href={`/events/${entry.event.id}`}>{entry.event.title}</Link></h2><p>{entry.description}</p></article>)}</section></main>;
}
