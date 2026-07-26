import { PrismaClient, DigestType } from "@prisma/client";
import { callModel } from "./model-client.mjs";

const prisma = new PrismaClient();
const type = String(process.argv[2] || "MORNING").toUpperCase();
if (!Object.values(DigestType).includes(type)) throw new Error(`Unsupported digest type: ${type}`);
const now = new Date();
const duration = type === DigestType.WEEKLY ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
const periodStart = new Date(now.getTime() - duration);
const dateKey = now.toISOString().slice(0, 10);
const key = `GLOBAL:${type}:${dateKey}`;

const existing = await prisma.digest.findUnique({ where: { key } });
if (existing) { console.log(`Digest already exists: ${key}`); await prisma.$disconnect(); process.exit(0); }

const limit = type === DigestType.WEEKLY ? 20 : 10;
const feedItems = await prisma.feedItem.findMany({
  where: { publishedAt: { gte: periodStart, lte: now } },
  include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 }, documents: { include: { document: { include: { source: true } } }, take: 1 } } } },
  orderBy: [{ rank: "desc" }, { publishedAt: "desc" }], take: limit,
});
if (feedItems.length === 0) { console.log("No published feed items for this period"); await prisma.$disconnect(); process.exit(0); }

const snapshots = feedItems.map((item) => { const analysis = item.event.analyses[0]; return { eventId: item.eventId, feedItemId: item.id, topic: item.event.topic, title: analysis?.summary || item.event.title, whyImportant: analysis?.whyImportant || "", confidence: analysis?.confidence || 0, importance: item.event.importance, source: item.event.documents[0]?.document.source.name || "" }; });
const result = await callModel({ key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL, system: `你是行业简报编辑。根据已经核验的内容生成简洁中文简报。输出纯 JSON：{"title":"","overview":"","changes":["本期最重要的变化"],"actions":["开发者或学习者可执行的建议"]}。不得加入输入中没有的事实。`, user: JSON.stringify({ type, items: snapshots }), maxTokens: type === DigestType.WEEKLY ? 1600 : 1000 });
await prisma.digest.create({ data: { key, type, title: String(result.title || `${dateKey} 行业简报`), overview: String(result.overview || ""), content: { ...result, items: snapshots }, periodStart, periodEnd: now } });
console.log(`Created ${type} digest with ${snapshots.length} items: ${key}`);
await prisma.$disconnect();
