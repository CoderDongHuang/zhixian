import { PrismaClient, AlertStatus } from "@prisma/client";

const prisma = new PrismaClient();
if (!process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL || !process.env.AUTH_SECRET) throw new Error("Alert email configuration is incomplete");
const keywords = await prisma.keywordSubscription.findMany({ where: { enabled: true, realtime: true }, include: { user: true } });
const since = new Date(Date.now() - 30 * 60 * 1000);
const events = await prisma.event.findMany({ where: { createdAt: { gte: since }, importance: { gte: 0.75 }, feedItems: { some: {} }, analyses: { some: { status: "AUTO_PUBLISHED" } } }, include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 } }, take: 100 });
let sent = 0;
for (const subscription of keywords) {
  const matches = events.filter((event) => `${event.title} ${event.topic || ""} ${event.analyses[0]?.summary || ""}`.toLowerCase().includes(subscription.normalized));
  for (const event of matches) {
    const exists = await prisma.alertDelivery.findUnique({ where: { userId_eventId_keywordId: { userId: subscription.userId, eventId: event.id, keywordId: subscription.id } } });
    if (exists?.status === AlertStatus.SENT) continue;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `知线重大提醒 <${process.env.EMAIL_FROM}>`, to: [subscription.user.email], subject: `知线关键词提醒：${subscription.keyword}`, html: `<p>匹配关键词：${subscription.keyword}</p><h2>${event.title}</h2><p>${event.analyses[0]?.summary || ""}</p><p><a href="${process.env.APP_URL}/events/${event.id}">查看事件详情</a></p>` }) });
    const payload = await response.json();
    await prisma.alertDelivery.upsert({ where: { userId_eventId_keywordId: { userId: subscription.userId, eventId: event.id, keywordId: subscription.id } }, update: { status: response.ok ? AlertStatus.SENT : AlertStatus.FAILED, providerId: payload.id, error: response.ok ? null : JSON.stringify(payload), sentAt: response.ok ? new Date() : null }, create: { userId: subscription.userId, eventId: event.id, keywordId: subscription.id, status: response.ok ? AlertStatus.SENT : AlertStatus.FAILED, providerId: payload.id, error: response.ok ? null : JSON.stringify(payload), sentAt: response.ok ? new Date() : null } });
    if (response.ok) sent++;
  }
}
console.log({ users: keywords.length, events: events.length, sent }); await prisma.$disconnect();
