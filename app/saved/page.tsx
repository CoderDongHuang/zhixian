import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await getCurrentUser(); if (!user) redirect("/login?next=/saved");
  const bookmarks = await prisma.bookmark.findMany({ where: { userId: user.id }, include: { feedItem: { include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 } } } } } }, orderBy: { createdAt: "desc" } });
  return <main className="library-shell"><header><Link href="/">← 返回信息流</Link><h1>我的收藏</h1><p>共 {bookmarks.length} 条</p></header><section className="library-list">{bookmarks.length === 0 ? <p className="empty-state">还没有收藏内容。</p> : bookmarks.map(({ feedItem, createdAt }) => { const analysis = feedItem.event.analyses[0]; return <article key={feedItem.id}><div><span>{feedItem.event.topic}</span><span>{createdAt.toLocaleDateString("zh-CN")}</span></div><h2><Link href={`/events/${feedItem.eventId}`}>{analysis?.summary || feedItem.event.title}</Link></h2><p>{analysis?.whyImportant}</p></article>; })}</section></main>;
}
