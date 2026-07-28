import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sortEntityTimeline } from "@/lib/entity-policy";

export const dynamic = "force-dynamic";
const typeLabels: Record<string, string> = { COMPANY: "公司", PERSON: "人物", PRODUCT: "产品", TECHNOLOGY: "技术", OPEN_SOURCE_PROJECT: "开源项目" };

export default async function EntityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entity = await prisma.entity.findUnique({
    where: { id },
    include: {
      aliases: { orderBy: { alias: "asc" } },
      mentions: {
        orderBy: { event: { createdAt: "desc" } },
        include: {
          document: { include: { source: true } },
          event: {
            include: {
              analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 },
              timeline: { orderBy: { occurredAt: "desc" } },
            },
          },
        },
      },
      outgoingRelations: { orderBy: { confidence: "desc" }, include: { toEntity: { select: { id: true, name: true, type: true } } } },
      incomingRelations: { orderBy: { confidence: "desc" }, include: { fromEntity: { select: { id: true, name: true, type: true } } } },
    },
  });
  if (!entity) notFound();
  const sourceMap = new Map<string, { url: string; title: string; source: string }>();
  for (const mention of entity.mentions) if (mention.document) sourceMap.set(mention.document.url, { url: mention.document.url, title: mention.document.title, source: mention.document.source.name });
  const sources = [...sourceMap.values()];
  const timeline = sortEntityTimeline(entity.mentions.flatMap((mention) => mention.event.timeline.map((item) => ({ ...item, eventId: mention.eventId }))));
  return <main className="detail-shell"><Link href="/entities">返回实体档案</Link><header><p className="eyebrow">{typeLabels[entity.type] || entity.type}</p><h1>{entity.name}</h1><p>更新于 {entity.updatedAt.toLocaleString("zh-CN", { hour12: false })}</p></header>
    <section><h2>简介</h2><p>{entity.description || "暂无描述"}</p>{entity.aliases.length > 0 && <div className="alias-list"><strong>别名</strong>{entity.aliases.map((item) => <span key={item.id}>{item.alias}</span>)}</div>}</section>
    <section><h2>实体关系</h2><div className="relation-list">{entity.outgoingRelations.map((item) => <article key={`out-${item.toEntityId}-${item.relation}`}><span>{item.relation}</span><Link href={`/entities/${item.toEntity.id}`}>{entity.name} → {item.toEntity.name}</Link><small>可信度 {Math.round(item.confidence * 100)}%</small>{item.evidence && <p>{item.evidence}</p>}</article>)}{entity.incomingRelations.map((item) => <article key={`in-${item.fromEntityId}-${item.relation}`}><span>{item.relation}</span><Link href={`/entities/${item.fromEntity.id}`}>{item.fromEntity.name} → {entity.name}</Link><small>可信度 {Math.round(item.confidence * 100)}%</small>{item.evidence && <p>{item.evidence}</p>}</article>)}{entity.outgoingRelations.length + entity.incomingRelations.length === 0 && <p className="empty-state">暂无已验证关系。</p>}</div></section>
    <section><h2>关联事件</h2>{entity.mentions.map((mention) => <article className="entity-event" key={mention.eventId}><div><span>{mention.event.topic || "未分类"}</span><span>{mention.event.createdAt.toLocaleDateString("zh-CN")}</span></div><h3><Link href={`/events/${mention.eventId}`}>{mention.event.analyses[0]?.summary || mention.event.title}</Link></h3><p>{mention.context}</p></article>)}</section>
    {timeline.length > 0 && <section><h2>时间线</h2>{timeline.map((item) => <article className="timeline-row" key={item.id}><time>{item.occurredAt.toLocaleDateString("zh-CN")}</time><div><strong><Link href={`/events/${item.eventId}`}>{item.label}</Link></strong><p>{item.description}</p></div></article>)}</section>}
    <section><h2>来源</h2>{sources.length === 0 ? <p>暂无来源链接。</p> : sources.map((source) => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.source}：{source.title}</a></p>)}</section>
  </main>;
}
