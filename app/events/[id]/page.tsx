import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InteractionBar } from "./interaction-bar";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
  const event = await prisma.event.findUnique({ where: { id }, include: { feedItems: { take: 1 }, mentions: { include: { entity: true } }, outgoingRelations: { include: { toEvent: true }, orderBy: { confidence: "desc" } }, incomingRelations: { include: { fromEvent: true }, orderBy: { confidence: "desc" } }, analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1, include: { evidence: { include: { document: true } } } }, documents: { include: { document: { include: { source: true } } } } } });
  const analysis = event?.analyses[0]; if (!event || !analysis) notFound();
  const feedItem = event.feedItems[0]; if (!feedItem) notFound();
  const [bookmark] = await Promise.all([
    prisma.bookmark.findUnique({ where: { userId_feedItemId: { userId: user.id, feedItemId: feedItem.id } } }),
    prisma.readHistory.upsert({ where: { userId_feedItemId: { userId: user.id, feedItemId: feedItem.id } }, update: { readAt: new Date() }, create: { userId: user.id, feedItemId: feedItem.id } }),
  ]);
  const facts = JSON.parse(analysis.facts || "[]") as string[]; const predictions = JSON.parse(analysis.predictions || "[]") as string[];
  const speechText = [analysis.summary, analysis.whyImportant, analysis.impact, analysis.developerImpact, analysis.learnerAdvice].filter(Boolean).join("。\n");
  return <main className="detail-shell"><Link href="/">← 返回信息流</Link><header><p className="eyebrow">{event.topic}</p><h1>{analysis.summary}</h1><p>可信度 {Math.round(analysis.confidence * 100)}% · 重要性 {Math.round(event.importance * 100)}</p></header><InteractionBar feedItemId={feedItem.id} eventId={event.id} topic={event.topic || "AI 行业"} speechText={speechText} initialBookmarked={Boolean(bookmark)} />
    <section><h2>为什么重要</h2><p>{analysis.whyImportant}</p></section><section><h2>行业影响</h2><p>{analysis.impact}</p></section><section><h2>对开发者的影响</h2><p>{analysis.developerImpact}</p></section><section><h2>学习建议</h2><p>{analysis.learnerAdvice}</p></section>
    <section><h2>已核验事实</h2><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></section>{predictions.length > 0 && <section><h2>趋势判断</h2><ul>{predictions.map((prediction) => <li key={prediction}>{prediction}</li>)}</ul></section>}
    {event.mentions.length > 0 && <section><h2>相关实体</h2><div className="entity-links">{event.mentions.map((mention) => <Link key={mention.entityId} href={`/entities/${mention.entityId}`}>{mention.entity.name}</Link>)}</div></section>}
    {event.outgoingRelations.length + event.incomingRelations.length > 0 && <section><h2>事件关系</h2><div className="relation-list">{event.incomingRelations.map((item) => <article key={`in-${item.fromEventId}`}><span>{item.relation}</span><Link href={`/events/${item.fromEventId}`}>{item.fromEvent.title} → 当前事件</Link></article>)}{event.outgoingRelations.map((item) => <article key={`out-${item.toEventId}`}><span>{item.relation}</span><Link href={`/events/${item.toEventId}`}>当前事件 → {item.toEvent.title}</Link></article>)}</div><p><Link href="/relations?kind=event">浏览全部事件关系</Link></p></section>}
    <section><h2>来源与依据</h2>{event.documents.map(({ document }) => <p key={document.id}><a href={document.url} target="_blank" rel="noreferrer">{document.source.name}：{document.title}</a></p>)}{analysis.evidence.map((evidence) => <blockquote key={evidence.id}>{evidence.quote}</blockquote>)}</section>
  </main>;
}
