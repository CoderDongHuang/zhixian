import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function RelationsPage({ searchParams }: { searchParams: Promise<{ kind?: string; relation?: string }> }) {
  const params = await searchParams; const kind = params.kind === "event" ? "event" : "entity"; const relation = params.relation?.slice(0, 80) || "";
  const [entityRelations, eventRelations, entityTypes, eventTypes] = await Promise.all([
    kind === "entity" ? prisma.entityRelation.findMany({ where: relation ? { relation } : {}, include: { fromEntity: true, toEntity: true }, orderBy: { confidence: "desc" }, take: 100 }) : Promise.resolve([]),
    kind === "event" ? prisma.eventRelation.findMany({ where: relation ? { relation } : {}, include: { fromEvent: true, toEvent: true }, orderBy: { confidence: "desc" }, take: 100 }) : Promise.resolve([]),
    prisma.entityRelation.findMany({ distinct: ["relation"], select: { relation: true }, orderBy: { relation: "asc" } }),
    prisma.eventRelation.findMany({ distinct: ["relation"], select: { relation: true }, orderBy: { relation: "asc" } }),
  ]);
  const types = kind === "entity" ? entityTypes : eventTypes;
  return <main className="library-shell"><header><Link href="/entities">返回实体档案</Link><h1>关系浏览</h1><p>筛选上下游、竞争、合作、引用及事件演进关系。</p></header><form className="relation-filters"><label>对象<select name="kind" defaultValue={kind}><option value="entity">实体关系</option><option value="event">事件关系</option></select></label><label>关系<select name="relation" defaultValue={relation}><option value="">全部关系</option>{types.map((item) => <option value={item.relation} key={item.relation}>{item.relation}</option>)}</select></label><button>筛选</button></form><section className="relation-list">{kind === "entity" ? entityRelations.map((item) => <article key={`${item.fromEntityId}-${item.toEntityId}-${item.relation}`}><span>{item.relation}</span><div><Link href={`/entities/${item.fromEntityId}`}>{item.fromEntity.name}</Link><b>→</b><Link href={`/entities/${item.toEntityId}`}>{item.toEntity.name}</Link></div><small>可信度 {Math.round(item.confidence * 100)}%</small><p>{item.evidence}</p></article>) : eventRelations.map((item) => <article key={`${item.fromEventId}-${item.toEventId}`}><span>{item.relation}</span><div><Link href={`/events/${item.fromEventId}`}>{item.fromEvent.title}</Link><b>→</b><Link href={`/events/${item.toEventId}`}>{item.toEvent.title}</Link></div><small>可信度 {Math.round(item.confidence * 100)}%</small></article>)}</section></main>;
}
