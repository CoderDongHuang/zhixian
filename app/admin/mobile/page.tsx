import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const isAdmin = (email?: string | null) => Boolean(email && (process.env.ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).includes(email.toLowerCase()));
export default async function MobileStabilityPage() {
  const user = await getCurrentUser(); if (!isAdmin(user?.email)) notFound();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [events, deliveries, feedback] = await Promise.all([
    prisma.behaviorEvent.findMany({ where: { createdAt: { gte: since }, action: { startsWith: "mobile_" } }, select: { action: true, value: true, metadata: true, createdAt: true } }),
    prisma.pushDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.behaviorEvent.findMany({ where: { createdAt: { gte: since }, action: "mobile_beta_feedback" }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const count = (action: string) => events.filter((event) => event.action === action).length;
  const startup = events.filter((event) => event.action === "mobile_app_open").map((event) => Number((event.metadata as { startupMs?: number } | null)?.startupMs || 0)).filter(Boolean);
  const averageStartup = startup.length ? Math.round(startup.reduce((sum, value) => sum + value, 0) / startup.length) : 0;
  return <main className="library-shell"><header><a href="/">返回首页</a><h1>移动端稳定性</h1><p>最近 7 天的匿名运行指标、推送交付和内测反馈。</p></header><section className="stat-grid"><article><strong>{count("mobile_app_open")}</strong><span>启动次数</span></article><article><strong>{averageStartup || "-"}</strong><span>平均启动毫秒</span></article><article><strong>{count("mobile_sync_complete")}</strong><span>同步完成</span></article><article><strong>{feedback.length}</strong><span>内测反馈</span></article></section><section><h2>推送状态</h2><ul>{deliveries.map((item) => <li key={item.status}>{item.status}: {item._count}</li>)}</ul></section><section><h2>最新反馈</h2>{feedback.length ? feedback.map((item) => <article key={item.id} className="digest-card"><strong>{item.value}/5</strong><p>{String((item.metadata as { message?: string } | null)?.message || "")}</p><small>{item.createdAt.toLocaleString("zh-CN")}</small></article>) : <p>暂无反馈</p>}</section></main>;
}
