import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import Image from "next/image";
import { getTopicAffinity, recommendationScore } from "@/lib/recommendations";
import { MobileTools } from "./mobile-tools";
import { getCachedFeed } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";
const topics = ["全部", "AI 行业", "大模型", "GitHub 开源项目"];

export default async function Home({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const user = await getCurrentUser();
  const { topic: requestedTopic } = await searchParams;
  const activeTopic = topics.includes(requestedTopic ?? "") ? requestedTopic! : "全部";
  const limit = user?.preference?.itemsPerDigest ?? 10;
  const preferredTopics = new Set(user?.preference?.topics ?? []);
  const [affinity, items] = await Promise.all([
    user ? getTopicAffinity(user.id) : Promise.resolve(new Map<string, number>()),
    getCachedFeed(activeTopic === "全部" ? null : activeTopic),
  ]);
  const ranked = items
    .map((item) => ({ ...item, personalizedRank: recommendationScore(item.rank, item.event.topic, preferredTopics, affinity) }))
    .sort((a, b) => b.personalizedRank - a.personalizedRank)
    .slice(0, limit);

  return <main className="feed-shell"><header className="feed-header"><div><Image className="brand-logo" src="/brand-logo.png" width={270} height={105} alt="知线 AI 行业研究" priority /><h1>值得关注的行业变化</h1><p>{user ? "已根据你的关注和阅读行为排序。" : "经过翻译、聚类、分析和双模型核验的信息。"}</p></div><div className="header-actions">{user ? <><span>{user.email}</span><nav><Link href="/research">研究工作台</Link><Link href="/trends">趋势监测</Link><Link href="/search">搜索</Link><Link href="/entities">实体</Link><Link href="/learning">学习路线</Link><Link href="/saved">收藏</Link><Link href="/history">历史</Link><Link href="/keywords">关键词提醒</Link><Link href="/onboarding">偏好</Link></nav><MobileTools publicKey={process.env.VAPID_PUBLIC_KEY || ""} userId={user.id} /><form action="/api/auth/logout" method="post"><button className="text-button">退出</button></form></> : <Link className="login-link" href="/login">登录解锁深度分析</Link>}</div></header>
    <nav className="topic-tabs">{topics.map((topic) => <Link className={topic === activeTopic ? "active" : ""} key={topic} href={topic === "全部" ? "/" : `/?topic=${encodeURIComponent(topic)}`}>{topic}</Link>)}<Link href="/trends">趋势监测</Link><Link href="/digests">行业简报</Link><Link href="/entities">实体档案</Link><Link href="/relations">关系浏览</Link></nav>
    <section className="feed-list">{ranked.length === 0 ? <p>当前没有通过自动核验的内容。</p> : ranked.map(({ event, personalizedRank }) => { const analysis = event.analyses[0]; const source = event.documents[0]?.document.source; return <article className="feed-card" key={event.id}>
      <div className="feed-meta"><span>{event.topic || "AI 行业"}</span><span>{source?.name}</span><span>可信度 {Math.round((analysis?.confidence || 0) * 100)}%</span></div>
      <h2>{user ? <Link href={`/events/${event.id}`}>{analysis?.summary || event.title}</Link> : analysis?.summary || event.title}</h2>
      <p>{analysis?.whyImportant}</p><footer><span>重要性 {Math.round(event.importance * 100)}</span><span>推荐分 {Math.round(personalizedRank * 100)}</span>{user ? <Link href={`/events/${event.id}`}>查看深度分析 →</Link> : <Link href="/login">登录查看详情 →</Link>}</footer>
    </article>; })}</section>
    {!user && <aside className="anonymous-notice"><strong>匿名体验模式</strong><span>登录后可查看深度分析、保存偏好和调整每次内容数量。</span></aside>}
  </main>;
}
