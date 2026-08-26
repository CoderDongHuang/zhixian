import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { researchTargetHref } from "@/lib/research-policy";
import { CollectionItemControls, CollectionSettings, CreateCollection, MarkNotificationRead, RevokeShare, ShareCollection } from "./research-controls";

export const dynamic = "force-dynamic";

const typeLabels = { EVENT: "事件", ENTITY: "实体", DIGEST: "简报" } as const;

export default async function ResearchWorkbench() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/research");
  const [subscriptions, collections, notifications] = await Promise.all([
    prisma.entitySubscription.findMany({ where: { userId: user.id, enabled: true }, include: { entity: { include: { mentions: { orderBy: { event: { createdAt: "desc" } }, take: 3, include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 } } } } } } } }, orderBy: { updatedAt: "desc" } }),
    prisma.researchCollection.findMany({ where: { userId: user.id }, include: { items: { orderBy: { createdAt: "desc" } }, shares: { orderBy: { createdAt: "desc" }, take: 5 } }, orderBy: { updatedAt: "desc" } }),
    prisma.researchNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return <main className="research-shell"><header><Link href="/">返回信息流</Link><p className="eyebrow">可信研究工作台</p><h1>研究专题与关注动态</h1><p>集中整理证据、个人判断、实体变化和纠错处理结果。</p><Link href="/research/agent">打开 AI 问答与研究代理</Link></header>
    {notifications.length > 0 && <section><div className="section-heading"><h2>通知</h2><span>{notifications.filter((item) => !item.readAt).length} 条未读</span></div><div className="notification-list">{notifications.map((item) => <article className={!item.readAt ? "unread" : ""} key={item.id}><div><strong>{item.title}</strong><time>{item.createdAt.toLocaleString("zh-CN", { hour12: false })}</time></div><p>{item.message}</p>{item.href && <Link href={item.href}>查看相关事件</Link>}{!item.readAt && <MarkNotificationRead id={item.id} />}</article>)}</div></section>}
    <section><div className="section-heading"><h2>实体关注</h2><Link href="/research/timeline">对比时间线</Link></div>{subscriptions.length === 0 ? <p className="empty-state">还没有关注实体。可在任一实体档案中开始关注。</p> : <div className="subscription-grid">{subscriptions.map(({ entity }) => <article key={entity.id}><h3><Link href={`/entities/${entity.id}`}>{entity.name}</Link></h3><p>{entity.description || "暂无简介"}</p>{entity.mentions.map((mention) => <Link className="subscription-event" key={mention.eventId} href={`/events/${mention.eventId}`}>{mention.event.analyses[0]?.summary || mention.event.title}</Link>)}</article>)}</div>}</section>
    <section><div className="section-heading"><h2>研究集合</h2><span>{collections.length} 个专题</span></div><CreateCollection /><div className="collection-list">{collections.map((collection) => <article className="collection-panel" key={collection.id}><header><div><h3>{collection.title}</h3><p>{collection.description || "未填写研究说明"}</p></div><div className="collection-header-actions"><ShareCollection collectionId={collection.id} /><CollectionSettings collectionId={collection.id} initialTitle={collection.title} initialDescription={collection.description || ""} /></div></header>{collection.items.length === 0 ? <p className="empty-state">从事件、实体或简报详情页把内容加入此专题。</p> : <div>{collection.items.map((item) => <section className="collection-item" key={item.id}><div className="feed-meta"><span>{typeLabels[item.targetType]}</span><span>{item.updatedAt.toLocaleString("zh-CN", { hour12: false })}</span></div><h4><Link href={researchTargetHref(item.targetType, item.targetId)}>{item.targetTitle}</Link></h4><CollectionItemControls itemId={item.id} initialNote={item.note || ""} /></section>)}</div>}{collection.shares.length > 0 && <footer><strong>分享历史</strong>{collection.shares.map((share) => <div key={share.id}><span>版本 {share.version} · {share.createdAt.toLocaleDateString("zh-CN")} · {share.revokedAt ? "已撤销" : share.expiresAt && share.expiresAt <= new Date() ? "已过期" : "有效"}</span>{!share.revokedAt && (!share.expiresAt || share.expiresAt > new Date()) && <RevokeShare shareId={share.id} />}</div>)}</footer>}</article>)}{collections.length === 0 && <p className="empty-state">创建第一个专题，开始积累可复用的研究材料。</p>}</div></section>
  </main>;
}
