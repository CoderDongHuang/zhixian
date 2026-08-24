import { PrismaClient, DigestType, DeliveryStatus } from "@prisma/client";
import { issueUnsubscribeToken } from "../lib/unsubscribe-token.mjs";
import { finishJob } from "./job-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const type = String(process.argv[2] || "MORNING").toUpperCase();
if (!Object.values(DigestType).includes(type)) throw new Error(`Unsupported digest type: ${type}`);
if (!process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM || !process.env.AUTH_SECRET) throw new Error("Email configuration is incomplete");
const digest = await prisma.digest.findFirst({ where: { type }, orderBy: { createdAt: "desc" } });
if (!digest) {
  await finishJob({ prisma, name: `digest-send-${type.toLowerCase()}`, summary: { digest: null, recipients: 0, eligible: 0, sent: 0, failed: 0, skipped: 0 }, startedAt, attempts: 0, output: 0, failOnEmptyInput: true });
  await prisma.$disconnect();
  process.exit();
}
const enabledField = type === DigestType.MORNING ? "morningEnabled" : type === DigestType.EVENING ? "eveningEnabled" : "weeklyEnabled";
const users = await prisma.user.findMany({ where: { email: { not: null }, OR: [{ preference: null }, { preference: { is: { emailEnabled: true, [enabledField]: true } } }] }, include: { preference: true, keywords: { where: { enabled: true } } } });
function localClock(timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (name) => parts.find((part) => part.type === name)?.value || "0";
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}
function isDue(user) {
  const preference = user.preference;
  const timezone = preference?.timezone || "Asia/Shanghai";
  const clock = localClock(timezone);
  if (type === DigestType.WEEKLY && clock.weekday !== (preference?.weeklyDay ?? 0)) return false;
  const configured = type === DigestType.MORNING ? preference?.morningTime || "08:00" : type === DigestType.EVENING ? preference?.eveningTime || "20:00" : preference?.morningTime || "09:00";
  const [hour, minute] = configured.split(":").map(Number);
  const delta = (clock.minutes - (hour * 60 + minute) + 1440) % 1440;
  return delta < 15;
}
const dueUsers = users.filter(isDue);
const content = digest.content;

function personalizedItems(user) {
  const preference = user.preference;
  const topics = new Set(preference?.topics || []);
  const interests = [...(preference?.skillDirections || []), ...(preference?.learningGoals || []), ...(user.keywords || []).map((item) => item.keyword)]
    .filter(Boolean).map((value) => String(value).toLowerCase());
  const items = Array.isArray(content.items) ? content.items : [];
  const ranked = items.map((item) => {
    const text = `${item.topic || ""} ${item.title || ""} ${item.whyImportant || ""}`.toLowerCase();
    const topicMatch = topics.size === 0 || topics.has(item.topic);
    const interestMatches = interests.filter((interest) => text.includes(interest)).length;
    return { item, topicMatch, score: (topicMatch ? 2 : 0) + interestMatches * 0.25 };
  });
  const topicMatches = ranked.filter(({ topicMatch }) => topicMatch);
  return (topicMatches.length > 0 ? topicMatches : ranked)
    .sort((a, b) => b.score - a.score).map(({ item }) => item);
}

function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function tokenFor(userId) { return issueUnsubscribeToken(userId); }
function list(values = []) { return values.map((value) => `<li style="margin:0 0 10px;line-height:1.6">${escapeHtml(value)}</li>`).join(""); }
function renderEmail(user) {
  const baseUrl = process.env.APP_URL || "http://127.0.0.1:3000";
  const selectedItems = personalizedItems(user).slice(0, user.preference?.itemsPerDigest || 10);
  const items = selectedItems.map((item) => `<div style="padding:18px 0;border-top:1px solid #e5e7eb"><div style="font-size:12px;color:#667085">${escapeHtml(item.topic)} · ${escapeHtml(item.source)} · 可信度 ${Math.round((item.confidence || 0) * 100)}%</div><h3 style="font-size:17px;line-height:1.5;margin:8px 0">${escapeHtml(item.title)}</h3><p style="color:#475467;line-height:1.7">${escapeHtml(item.whyImportant)}</p></div>`).join("");
  const unsubscribe = `${baseUrl}/unsubscribe?user=${encodeURIComponent(user.id)}&token=${tokenFor(user.id)}`;
  return `<!doctype html><html><body style="margin:0;background:#f5f6f7;font-family:Arial,'Microsoft YaHei',sans-serif;color:#182230"><div style="max-width:680px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #e4e7ec;padding:30px"><div style="color:#176b4d;font-weight:700">知线 · AI 行业研究</div><h1 style="font-size:26px;line-height:1.35">${escapeHtml(digest.title)}</h1><p style="line-height:1.7;color:#475467">${escapeHtml(digest.overview)}</p><h2 style="font-size:18px">重要变化</h2><ul>${list(content.changes)}</ul><h2 style="font-size:18px">行动建议</h2><ul>${list(content.actions)}</ul><h2 style="font-size:18px">本期精选</h2>${items}<p style="margin-top:28px"><a href="${baseUrl}/digests/${digest.id}" style="color:#176b4d;font-weight:700">查看完整简报</a></p></div><p style="text-align:center;color:#98a2b3;font-size:12px;line-height:1.6">你收到这封邮件是因为订阅了知线行业简报。<a href="${unsubscribe}" style="color:#667085">管理或退订邮件</a></p></div></body></html>`;
}

let sent = 0, failed = 0, skipped = 0;
for (const user of dueUsers) {
  const existing = await prisma.emailDelivery.findUnique({ where: { digestId_userId: { digestId: digest.id, userId: user.id } } });
  if (existing?.status === DeliveryStatus.SENT) { skipped++; continue; }
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `知线行业简报 <${process.env.DIGEST_EMAIL_FROM || process.env.EMAIL_FROM}>`, to: [user.email], subject: digest.title, html: renderEmail(user) }), signal: AbortSignal.timeout(30000) });
    const result = await response.json(); if (!response.ok) throw new Error(result?.message || `Resend HTTP ${response.status}`);
    await prisma.emailDelivery.upsert({ where: { digestId_userId: { digestId: digest.id, userId: user.id } }, update: { status: DeliveryStatus.SENT, providerId: result.id, error: null, sentAt: new Date() }, create: { digestId: digest.id, userId: user.id, recipient: user.email, status: DeliveryStatus.SENT, providerId: result.id, sentAt: new Date() } }); sent++;
  } catch (error) {
    await prisma.emailDelivery.upsert({ where: { digestId_userId: { digestId: digest.id, userId: user.id } }, update: { status: DeliveryStatus.FAILED, error: String(error.message).slice(0, 1000) }, create: { digestId: digest.id, userId: user.id, recipient: user.email, status: DeliveryStatus.FAILED, error: String(error.message).slice(0, 1000) } }); failed++;
  }
}
await finishJob({ prisma, name: `digest-send-${type.toLowerCase()}`, summary: { digest: digest.key, recipients: dueUsers.length, eligible: users.length, sent, failed, skipped }, startedAt, attempts: sent + failed, output: sent, failOnZeroOutput: true });
await prisma.$disconnect();
