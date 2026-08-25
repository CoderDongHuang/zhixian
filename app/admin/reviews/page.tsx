import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/entity-policy";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export default async function ReviewQueue() {
  const user = await getCurrentUser();
  if (!isAdminEmail(user?.email)) notFound();
  const [reviews, corrections] = await Promise.all([
    prisma.analysis.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { analyzedAt: "asc" }, take: 100, include: { event: { select: { id: true, title: true, topic: true } }, evidence: { take: 2, include: { document: { select: { title: true, url: true } } } } } }),
    prisma.feedback.findMany({ where: { report: { not: null }, correctionStatus: "PENDING" }, orderBy: { updatedAt: "asc" }, take: 100, include: { user: { select: { email: true } }, feedItem: { include: { event: { select: { id: true, title: true } } } } } }),
  ]);
  return <main className="library-shell"><header><Link href="/">返回信息流</Link><h1>内容与纠错审核</h1><p>{reviews.length} 条低置信度分析，{corrections.length} 条用户纠错待处理。</p></header>
    <nav className="subnav"><a href="#analysis">分析审核</a><a href="#corrections">用户纠错</a></nav>
    <section id="corrections"><h2>用户纠错</h2><div className="review-list">{corrections.length === 0 ? <p className="empty-state">当前没有待处理纠错。</p> : corrections.map((feedback) => <article className="review-card" key={feedback.id}><div className="feed-meta"><span>{feedback.user.email || "未绑定邮箱"}</span><span>{feedback.updatedAt.toLocaleString("zh-CN", { hour12: false })}</span></div><h3><Link href={`/events/${feedback.feedItem.eventId}`}>{feedback.feedItem.event.title}</Link></h3><blockquote>{feedback.report}</blockquote><form className="correction-form" action="/api/admin/corrections" method="post"><input type="hidden" name="id" value={feedback.id} /><label>处理结论<textarea name="resolution" required maxLength={2000} placeholder="说明已修订内容，或说明不采纳的依据" /></label><div><button name="status" value="RESOLVED">标记已修订</button><button className="secondary" name="status" value="REJECTED">不采纳</button></div></form></article>)}</div></section>
    <section id="analysis"><h2>低置信度分析</h2><div className="review-list">{reviews.length === 0 ? <p className="empty-state">当前没有待审核内容。</p> : reviews.map((review) => <article className="review-card" key={review.id}><div className="feed-meta"><span>{review.event.topic || "未分类"}</span><span>可信度 {Math.round(review.confidence * 100)}%</span></div><h3>{review.summary}</h3><p>{review.whyImportant}</p><p><Link href={`/events/${review.event.id}`}>查看事件详情</Link></p><ul>{review.evidence.map((item) => <li key={item.document.url}><a href={item.document.url} target="_blank" rel="noreferrer">{item.document.title}</a><blockquote>{item.quote}</blockquote></li>)}</ul><div className="review-actions"><form action="/api/admin/reviews" method="post"><input type="hidden" name="id" value={review.id} /><button name="status" value="APPROVED">通过</button><button className="secondary" name="status" value="REJECTED">驳回</button></form></div></article>)}</div></section>
  </main>;
}
