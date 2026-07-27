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
  const event = await prisma.event.findUnique({ where: { id }, include: { feedItems: { take: 1 }, analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1, include: { evidence: { include: { document: true } } } }, documents: { include: { document: { include: { source: true } } } } } });
  const analysis = event?.analyses[0]; if (!event || !analysis) notFound();
  const feedItem = event.feedItems[0]; if (!feedItem) notFound();
  const [bookmark] = await Promise.all([
    prisma.bookmark.findUnique({ where: { userId_feedItemId: { userId: user.id, feedItemId: feedItem.id } } }),
    prisma.readHistory.upsert({ where: { userId_feedItemId: { userId: user.id, feedItemId: feedItem.id } }, update: { readAt: new Date() }, create: { userId: user.id, feedItemId: feedItem.id } }),
  ]);
  const facts = JSON.parse(analysis.facts || "[]") as string[]; const predictions = JSON.parse(analysis.predictions || "[]") as string[];
  return <main className="detail-shell"><Link href="/">← 返回信息流</Link><header><p className="eyebrow">{event.topic}</p><h1>{analysis.summary}</h1><p>可信度 {Math.round(analysis.confidence * 100)}% · 重要性 {Math.round(event.importance * 100)}</p></header><InteractionBar feedItemId={feedItem.id} initialBookmarked={Boolean(bookmark)} />
    <section><h2>为什么重要</h2><p>{analysis.whyImportant}</p></section><section><h2>行业影响</h2><p>{analysis.impact}</p></section><section><h2>对开发者的影响</h2><p>{analysis.developerImpact}</p></section><section><h2>学习建议</h2><p>{analysis.learnerAdvice}</p></section>
    <section><h2>已核验事实</h2><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></section>{predictions.length > 0 && <section><h2>趋势判断</h2><ul>{predictions.map((prediction) => <li key={prediction}>{prediction}</li>)}</ul></section>}
    <section><h2>来源与依据</h2>{event.documents.map(({ document }) => <p key={document.id}><a href={document.url} target="_blank" rel="noreferrer">{document.source.name}：{document.title}</a></p>)}{analysis.evidence.map((evidence) => <blockquote key={evidence.id}>{evidence.quote}</blockquote>)}</section>
  </main>;
}
