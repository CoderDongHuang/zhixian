import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const user = await getCurrentUser();
  if (!user) return <main className="auth-page"><section className="auth-panel"><h1>请先登录</h1><Link href="/login">登录</Link></section></main>;
  const keywords = await prisma.keywordSubscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return <main className="library-shell"><header><Link href="/">← 返回信息流</Link><h1>关键词提醒</h1><p>订阅关键词后，匹配到重大行业事件会发送提醒。</p></header><form action="/api/keywords" method="post" className="keyword-form"><label>关键词<input name="keyword" required maxLength={100} placeholder="例如：open source" /></label><button type="submit">添加关键词</button></form><section className="library-list">{keywords.length === 0 ? <p className="empty-state">还没有订阅关键词。</p> : keywords.map((item) => <article key={item.id}><div><strong>{item.keyword}</strong><span>{item.realtime ? "实时提醒" : "仅日报"}</span></div></article>)}</section></main>;
}
