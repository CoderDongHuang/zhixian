import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExportTools } from "./export-tools";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";
type DigestContent = { changes?: string[]; actions?: string[]; items?: { eventId: string; topic: string; title: string; whyImportant: string; confidence: number; source: string }[] };

export default async function DigestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const digest = await prisma.digest.findUnique({ where: { id } }); if (!digest) notFound();
  const content = digest.content as DigestContent;
  const mentions = await prisma.entityMention.findMany({ where: { eventId: { in: content.items?.map((item) => item.eventId) || [] } }, include: { entity: { select: { id: true, name: true } } } });
  const entitiesByEvent = Map.groupBy(mentions, (mention) => mention.eventId);
  return <main className="detail-shell"><Link href="/digests">← 返回简报</Link><header><p className="eyebrow">{digest.type === "WEEKLY" ? "行业周报" : digest.type === "MORNING" ? "早间简报" : "晚间简报"}</p><h1>{digest.title}</h1><p>{digest.overview}</p></header>
    <ExportTools digestId={digest.id} />
    <section><h2>重要变化</h2><ul>{content.changes?.map((change) => <li key={change}>{change}</li>)}</ul></section><section><h2>行动建议</h2><ul>{content.actions?.map((action) => <li key={action}>{action}</li>)}</ul></section><section><h2>本期内容</h2>{content.items?.map((item) => <article className="digest-item" key={item.eventId}><div><span>{item.topic}</span><span>{item.source}</span><span>可信度 {Math.round(item.confidence * 100)}%</span></div><h3>{item.title}</h3><p>{item.whyImportant}</p>{entitiesByEvent.get(item.eventId)?.length ? <div className="entity-links">{entitiesByEvent.get(item.eventId)!.map((mention) => <Link key={mention.entityId} href={`/entities/${mention.entityId}`}>{mention.entity.name}</Link>)}</div> : null}<Link href={`/events/${item.eventId}`}>查看深度分析 →</Link></article>)}</section>
  </main>;
}
