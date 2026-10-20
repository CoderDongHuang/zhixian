import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getTopicAffinity, recommendationScore } from "@/lib/recommendations";
import { MobileTools } from "./mobile-tools";
import { getCachedFeed } from "@/lib/public-data";
import { prisma } from "@/lib/prisma";
import { latestPublication } from "@/lib/operations.mjs";

import { getRawFeed, getCollectionFreshness } from "@/lib/raw-feed";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";
const topics = ["全部", "AI 行业", "大模型", "GitHub 开源项目"];

export default async function Home({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const user = await getCurrentUser();
  const { topic: requestedTopic } = await searchParams;
  const activeTopic = topics.includes(requestedTopic ?? "") ? requestedTopic! : "全部";
  const limit = user?.preference?.itemsPerDigest ?? 10;
  const preferredTopics = new Set(user?.preference?.topics ?? []);
  const [affinity, items, latestPublishedAt, rawItems, latestFetchedAt] = await Promise.all([
    user ? getTopicAffinity(user.id) : Promise.resolve(new Map<string, number>()),
    getCachedFeed(activeTopic === "全部" ? null : activeTopic),
    latestPublication(prisma),
    getRawFeed(prisma, activeTopic === "全部" ? null : activeTopic, 10),
    getCollectionFreshness(prisma),
  ]);
  const ranked = items
    .map((item) => ({ ...item, personalizedRank: recommendationScore(item.rank, item.event.topic, preferredTopics, affinity) }))
    .sort((a, b) => b.personalizedRank - a.personalizedRank)
    .slice(0, limit);

  return <main className="feed-shell"><header className="feed-header"><div><p className="eyebrow">发现 · AI 行业观察</p><h1>值得关注的行业变化</h1><p>{user ? "已根据你的关注和阅读行为排序。" : "从行业变化出发，用来源和证据建立判断。"}</p></div><div className="header-actions">{user ? <MobileTools publicKey={process.env.VAPID_PUBLIC_KEY || ""} userId={user.id} /> : <Link className="login-link" href="/login">登录解锁深度分析 <span aria-hidden="true">↗</span></Link>}</div></header>
    <nav className="topic-tabs" aria-label="内容主题">{topics.map((topic) => <Link aria-current={topic === activeTopic ? "page" : undefined} className={topic === activeTopic ? "active" : ""} key={topic} href={topic === "全部" ? "/" : `/?topic=${encodeURIComponent(topic)}`}>{topic}</Link>)}</nav>
    <p className="feed-meta" data-testid="content-freshness">最近采集成功：{latestFetchedAt ? <time dateTime={latestFetchedAt.toISOString()}>{latestFetchedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</time> : "暂无"} · 分析最新发布：{latestPublishedAt ? <time dateTime={latestPublishedAt.toISOString()}>{latestPublishedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</time> : "暂无"}</p>
    <div className="feed-layout"><div><section className="feed-list" aria-label="最新采集"><header className="raw-feed-header"><h2>最新采集</h2><p>来自公开来源的原始资讯，未经 AI 分析与事实核验，请以原文为准。</p></header>{rawItems.length ? rawItems.map(item => <article className="feed-card raw-feed-card" key={item.id}><div className="feed-meta"><span className="content-status">原始资讯 · 请核对原文</span><span>{item.source.name}</span></div><h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></h3><footer><span>采集于 <time dateTime={item.fetchedAt.toISOString()}>{item.fetchedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</time></span><a href={item.url} target="_blank" rel="noopener noreferrer">查看原文 ↗</a></footer></article>) : <div className="empty-state"><p>这个主题暂时没有采集材料，可以切换到全部查看。</p></div>}</section><section className="feed-list" aria-label="行业信息流"><header className="raw-feed-header"><h2>已核验分析</h2><p>完成 AI 分析并通过发布检查后，内容会显示在这里。</p></header>{ranked.length === 0 ? <div className="empty-state"><h3>暂时没有已发布分析</h3><p>原始资讯已在上方展示；分析完成并通过核验后会自动更新。</p><Link href="/digests">查看简报 →</Link></div> : ranked.map(({ event, personalizedRank }) => { const analysis = event.analyses[0]; const source = event.documents[0]?.document.source; return <article className="feed-card" key={event.id}>
      <div className="feed-meta"><span className="content-status verified">已核验分析</span><span>{event.topic || "AI 行业"}</span><span>{source?.name}</span><span>可信度 {Math.round((analysis?.confidence || 0) * 100)}%</span></div>
      <h2>{user ? <Link href={`/events/${event.id}`}>{analysis?.summary || event.title}</Link> : analysis?.summary || event.title}</h2>
      <p>{analysis?.whyImportant}</p><footer><span>重要性 {Math.round(event.importance * 100)}</span><span>推荐分 {Math.round(personalizedRank * 100)}</span>{user ? <Link href={`/events/${event.id}`}>查看深度分析 →</Link> : <Link href="/login">登录查看详情 →</Link>}</footer>
    </article>; })}</section></div><aside className="feed-aside"><p className="eyebrow">你的研究路径</p><h2>从阅读，到自己的判断</h2><p>保存值得追踪的变化，将线索整理成专题，再回到原始证据。</p><ol><li><Link href="/trends">观察行业趋势 <span aria-hidden="true">↗</span></Link><small>区分热度与实际变化</small></li><li><Link href="/research">建立研究专题 <span aria-hidden="true">↗</span></Link><small>收藏、对比与核对证据</small></li><li><Link href="/learning">开始学习实践 <span aria-hidden="true">↗</span></Link><small>把理解转化为每日练习</small></li></ol><div className="aside-note">保留来源，标注冲突。<br/>证据不足时，明确说明。</div></aside></div>
    {!user && <aside className="anonymous-notice"><strong>匿名体验模式</strong><span>登录后可查看深度分析、保存偏好和调整每次内容数量。</span></aside>}
  </main>;
}
