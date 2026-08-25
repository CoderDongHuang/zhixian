import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseTimelineWindow } from "@/lib/research-policy";

export const dynamic = "force-dynamic";

export default async function ResearchTimeline({ searchParams }: { searchParams: Promise<{ entityId?: string; days?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/research/timeline");
  const params = await searchParams;
  const days = parseTimelineWindow(params.days);
  const entities = await prisma.entity.findMany({ where: { subscriptions: { some: { userId: user.id, enabled: true } } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const selectedId = entities.some((item) => item.id === params.entityId) ? params.entityId! : entities[0]?.id;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const entity = selectedId ? await prisma.entity.findUnique({ where: { id: selectedId }, include: { mentions: { include: { event: { include: { timeline: { where: { occurredAt: { gte: cutoff } }, orderBy: { occurredAt: "desc" } }, analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 } } } } } } }) : null;
  const changes = (entity?.mentions.flatMap((mention) => mention.event.timeline.map((entry) => ({ ...entry, eventId: mention.eventId, importance: mention.event.importance, eventTitle: mention.event.analyses[0]?.summary || mention.event.title }))) || []).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return <main className="research-shell"><header><Link href="/research">返回研究工作台</Link><p className="eyebrow">时间线对比</p><h1>{entity ? entity.name : "关注实体"}的重要变化</h1><p>按统一窗口查看实体关联事件，重要性来自已核验事件评分。</p></header><form className="timeline-filters"><label>实体<select name="entityId" defaultValue={selectedId}>{entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset><legend>时间范围</legend><div className="segmented">{[7, 30, 90].map((window) => <label key={window}><input type="radio" name="days" value={window} defaultChecked={days === window} />{window} 天</label>)}</div></fieldset><button type="submit">查看</button></form>{!entity ? <p className="empty-state">请先在实体档案中关注公司、产品、技术或开源项目。</p> : changes.length === 0 ? <p className="empty-state">该时间窗口内暂无带时间标记的重要变化。</p> : <section className="comparison-timeline">{changes.map((change) => <article key={change.id}><time>{change.occurredAt.toLocaleDateString("zh-CN")}</time><div><span>重要性 {Math.round(change.importance * 100)}</span><h2><Link href={`/events/${change.eventId}`}>{change.label}</Link></h2><p>{change.description}</p><small>{change.eventTitle}</small>{change.sourceUrl && <a href={change.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>}</div></article>)}</section>}</main>;
}
