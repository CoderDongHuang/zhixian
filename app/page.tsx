import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const topics = ["全部", "AI 行业", "大模型", "GitHub 开源项目"];

export default async function Home({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const user = await getCurrentUser();
  const { topic: requestedTopic } = await searchParams;
  const activeTopic = topics.includes(requestedTopic ?? "") ? requestedTopic! : "全部";
  const limit = user?.preference?.itemsPerDigest ?? 10;
  const preferredTopics = new Set(user?.preference?.topics ?? []);
  const items = await prisma.feedItem.findMany({
    where: activeTopic === "全部" ? undefined : { event: { topic: activeTopic } },
    include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 }, documents: { include: { document: { include: { source: true } } } } } } },
    orderBy: [{ publishedAt: "desc" }], take: 50,
  });
  const ranked = items
    .map((item) => ({ ...item, personalizedRank: item.rank + (preferredTopics.has(item.event.topic ?? "") ? 0.15 : 0) }))
    .sort((a, b) => b.personalizedRank - a.personalizedRank)
    .slice(0, limit);

  return <main className="feed-shell"><header className="feed-header"><div><p className="eyebrow">知线 · AI Industry Intelligence</p><h1>值得关注的行业变化</h1><p>{user ? "已根据你的关注方向排序。" : "经过翻译、聚类、分析和双模型核验的信息。"}</p></div><div className="header-actions">{user ? <><span>{user.email}</span><nav><Link href="/saved">收藏</Link><Link href="/history">历史</Link><Link href="/onboarding">偏好</Link></nav><form action="/api/auth/logout" method="post"><button className="text-button">退出</button></form></> : <Link className="login-link" href="/login">登录解锁深度分析</Link>}</div></header>
    <nav className="topic-tabs">{topics.map((topic) => <Link className={topic === activeTopic ? "active" : ""} key={topic} href={topic === "全部" ? "/" : `/?topic=${encodeURIComponent(topic)}`}>{topic}</Link>)}<Link href="/digests">行业简报</Link></nav>
    <section className="feed-list">{ranked.length === 0 ? <p>当前没有通过自动核验的内容。</p> : ranked.map(({ event, personalizedRank }) => { const analysis = event.analyses[0]; const source = event.documents[0]?.document.source; return <article className="feed-card" key={event.id}>
      <div className="feed-meta"><span>{event.topic || "AI 行业"}</span><span>{source?.name}</span><span>可信度 {Math.round((analysis?.confidence || 0) * 100)}%</span></div>
      <h2>{user ? <Link href={`/events/${event.id}`}>{analysis?.summary || event.title}</Link> : analysis?.summary || event.title}</h2>
      <p>{analysis?.whyImportant}</p><footer><span>重要性 {Math.round(event.importance * 100)}</span><span>推荐分 {Math.round(personalizedRank * 100)}</span>{user ? <Link href={`/events/${event.id}`}>查看深度分析 →</Link> : <Link href="/login">登录查看详情 →</Link>}</footer>
    </article>; })}</section>
    {!user && <aside className="anonymous-notice"><strong>匿名体验模式</strong><span>登录后可查看深度分析、保存偏好和调整每次内容数量。</span></aside>}
  </main>;
}
