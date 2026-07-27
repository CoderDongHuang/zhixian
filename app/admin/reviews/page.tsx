import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

function isAdmin(email?: string | null) {
  return Boolean(email && (process.env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).includes(email.toLowerCase()));
}

export default async function ReviewQueue() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) notFound();
  const reviews = await prisma.analysis.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { analyzedAt: "asc" }, take: 100, include: { event: { select: { id: true, title: true, topic: true } }, evidence: { take: 2, include: { document: { select: { title: true, url: true } } } } } });
  return <main className="library-shell"><header><a href="/">← 返回信息流</a><h1>低置信度审核</h1><p>共 {reviews.length} 条待处理内容。通过后会进入公开信息流。</p></header><section className="review-list">{reviews.length === 0 ? <p className="empty-state">当前没有待审核内容。</p> : reviews.map((review) => <article className="review-card" key={review.id}><div className="feed-meta"><span>{review.event.topic || "未分类"}</span><span>可信度 {Math.round(review.confidence * 100)}%</span></div><h2>{review.summary}</h2><p>{review.whyImportant}</p><p><a href={`/events/${review.event.id}`}>查看事件详情</a></p><ul>{review.evidence.map((item) => <li key={item.document.url}><a href={item.document.url} target="_blank" rel="noreferrer">{item.document.title}</a><blockquote>{item.quote}</blockquote></li>)}</ul><div className="review-actions"><form action="/api/admin/reviews" method="post"><input type="hidden" name="id" value={review.id} /><button name="status" value="APPROVED">通过</button><button className="secondary" name="status" value="REJECTED">驳回</button></form></div></article>)}</section></main>;
}
