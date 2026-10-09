import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InteractionBar } from "./interaction-bar";
import { AddToCollection } from "@/app/research/research-controls";
import { latestAnalysisOrder, publicEventWhere } from "@/lib/publication";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
  const event = await prisma.event.findUnique({
    where: { id, ...publicEventWhere },
    include: {
      feedItems: { take: 1 },
      mentions: { include: { entity: true } },
      outgoingRelations: { where: { toEvent: publicEventWhere }, include: { toEvent: true }, orderBy: { confidence: "desc" } },
      incomingRelations: { where: { fromEvent: publicEventWhere }, include: { fromEvent: true }, orderBy: { confidence: "desc" } },
      analyses: {
        where: { status: "AUTO_PUBLISHED" },
        orderBy: latestAnalysisOrder,
        take: 1,
        include: { evidence: { include: { document: { include: { source: true } } } } },
      },
      documents: { include: { document: { include: { source: true } } } },
    },
  });
  const analysis = event?.analyses[0]; if (!event || !analysis) notFound();
  const feedItem = event.feedItems[0]; if (!feedItem) notFound();
  const [bookmark] = await Promise.all([
    prisma.bookmark.findUnique({ where: { userId_feedItemId: { userId: user.id, feedItemId: feedItem.id } } }),
    prisma.readHistory.upsert({ where: { userId_feedItemId: { userId: user.id, feedItemId: feedItem.id } }, update: { readAt: new Date() }, create: { userId: user.id, feedItemId: feedItem.id } }),
  ]);
  const parseList = (value: string | null) => { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } };
  const facts = parseList(analysis.facts); const predictions = parseList(analysis.predictions);
  const speechText = [analysis.summary, analysis.whyImportant, analysis.impact, analysis.developerImpact, analysis.learnerAdvice].filter(Boolean).join("。\n");
  return <main className="detail-shell"><Link href="/">← 返回信息流</Link><header><p className="eyebrow">{event.topic}</p><h1>{analysis.summary}</h1><p>可信度 {Math.round(analysis.confidence * 100)}% · 重要性 {Math.round(event.importance * 100)}</p><AddToCollection targetType="EVENT" targetId={event.id} /></header><InteractionBar feedItemId={feedItem.id} eventId={event.id} topic={event.topic || "AI 行业"} speechText={speechText} initialBookmarked={Boolean(bookmark)} />
    <section><h2>为什么重要</h2><p>{analysis.whyImportant}</p></section><section><h2>行业影响</h2><p>{analysis.impact}</p></section><section><h2>对开发者的影响</h2><p>{analysis.developerImpact}</p></section><section><h2>学习建议</h2><p>{analysis.learnerAdvice}</p></section>
    <section><h2>已核验事实</h2><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></section>{predictions.length > 0 && <section><h2>趋势判断</h2><ul>{predictions.map((prediction) => <li key={prediction}>{prediction}</li>)}</ul></section>}
    {event.mentions.length > 0 && <section><h2>相关实体</h2><div className="entity-links">{event.mentions.map((mention) => <Link key={mention.entityId} href={`/entities/${mention.entityId}`}>{mention.entity.name}</Link>)}</div></section>}
    {event.outgoingRelations.length + event.incomingRelations.length > 0 && <section><h2>事件关系</h2><div className="relation-list">{event.incomingRelations.map((item) => <article key={`in-${item.fromEventId}`}><span>{item.relation}</span><Link href={`/events/${item.fromEventId}`}>{item.fromEvent.title} → 当前事件</Link></article>)}{event.outgoingRelations.map((item) => <article key={`out-${item.toEventId}`}><span>{item.relation}</span><Link href={`/events/${item.toEventId}`}>当前事件 → {item.toEvent.title}</Link></article>)}</div><p><Link href="/relations?kind=event">浏览全部事件关系</Link></p></section>}
    <section><h2>证据对照</h2><p className="section-intro">结论与原文片段逐项对应；冲突证据会单独标识，不计入支持材料。</p><div className="evidence-comparison"><article><span>研究结论</span><h3>{analysis.summary}</h3><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></article><div>{analysis.evidence.map((evidence) => <article className={`evidence-${evidence.stance.toLowerCase()}`} key={evidence.id}><div><span>{evidence.stance === "SUPPORT" ? "支持" : evidence.stance === "CONFLICT" ? "冲突" : "背景"}</span><a href={evidence.document.url} target="_blank" rel="noreferrer">{evidence.document.source.name}</a></div><blockquote>{evidence.quote}</blockquote><small>{evidence.document.title}</small></article>)}{analysis.evidence.length === 0 && <p className="empty-state">暂无可对照的原文片段。</p>}</div></div></section><section><h2>全部来源</h2>{event.documents.map(({ document }) => <p key={document.id}><a href={document.url} target="_blank" rel="noreferrer">{document.source.name}：{document.title}</a></p>)}</section>
  </main>;
}
