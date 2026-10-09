import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser(); if (!user) redirect("/login?next=/history");
  const reads = await prisma.readHistory.findMany({ where: { userId: user.id }, include: { feedItem: { include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 1 } } } } } }, orderBy: { readAt: "desc" }, take: 100 });
  const visibleReads = reads.map((item) => item.feedItem.event.isPublic ? item : { ...item, feedItem: { ...item.feedItem, event: { ...item.feedItem.event, title: "内容已撤回或待重新审核（阅读记录保留）", analyses: [] } } });
  return <main className="library-shell"><header><Link href="/">← 返回信息流</Link><h1>阅读历史</h1><p>最近阅读的 {reads.length} 条内容</p></header><section className="library-list">{visibleReads.length === 0 ? <p className="empty-state">还没有阅读记录。</p> : visibleReads.map(({ feedItem, readAt }) => { const analysis = feedItem.event.analyses[0]; return <article key={feedItem.id}><div><span>{feedItem.event.topic}</span><span>{readAt.toLocaleString("zh-CN", { hour12: false })}</span></div><h2>{analysis ? <Link href={`/events/${feedItem.eventId}`}>{analysis.summary}</Link> : feedItem.event.title}</h2><p>{analysis?.whyImportant}</p></article>; })}</section></main>;
}
