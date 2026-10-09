import { PrismaClient, DigestType } from "@prisma/client";
import { callModel } from "./model-client.mjs";
import { finishJob } from "./job-policy.mjs";
import { runTask, assertTaskLease, replayTarget } from "../lib/pipeline-tasks.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const type = String(process.argv[2] || "MORNING").toUpperCase();
if (!Object.values(DigestType).includes(type)) throw new Error(`Unsupported digest type: ${type}`);
const replay = await replayTarget(prisma, `digest-generate-${type.toLowerCase()}`);
const now = replay ? new Date(Math.min(Date.now(), Date.parse(`${replay.revision}T23:59:59.999Z`))) : new Date();
const duration = type === DigestType.WEEKLY ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
const periodStart = new Date(now.getTime() - duration);
const dateKey = now.toISOString().slice(0, 10);
const key = `GLOBAL:${type}:${dateKey}`;

const existing = await prisma.digest.findUnique({ where: { key } });
if (existing) {
  if (replay) await runTask(prisma, { name: replay.name, resourceId: key, revision: dateKey }, async () => false);
  await finishJob({ prisma, name: `digest-generate-${type.toLowerCase()}`, summary: { key, reused: true, items: 0, failed: 0 }, startedAt, attempts: 1, output: 1 });
  await prisma.$disconnect();
  process.exit();
}

const limit = type === DigestType.WEEKLY ? 20 : 10;
const feedItems = await prisma.feedItem.findMany({
  where: { publishedAt: { gte: periodStart, lte: now }, event: { isPublic: true } },
  include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 1 }, documents: { include: { document: { include: { source: true } } }, take: 1 } } } },
  orderBy: [{ rank: "desc" }, { publishedAt: "desc" }], take: limit,
});
if (feedItems.length === 0) {
  await finishJob({ prisma, name: `digest-generate-${type.toLowerCase()}`, summary: { key, reused: false, items: 0, failed: 0 }, startedAt, attempts: 0, output: 0, failOnEmptyInput: true });
  await prisma.$disconnect();
  process.exit();
}

const snapshots = feedItems.map((item) => { const analysis = item.event.analyses[0]; return { eventId: item.eventId, feedItemId: item.id, topic: item.event.topic, title: analysis?.summary || item.event.title, whyImportant: analysis?.whyImportant || "", confidence: analysis?.confidence || 0, importance: item.event.importance, source: item.event.documents[0]?.document.source.name || "" }; });
try {
  const task = await runTask(prisma, { name: `digest-generate-${type.toLowerCase()}`, resourceId: key, revision: dateKey }, async () => {
  const result = await callModel({ key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL, system: `你是行业简报编辑。根据已经核验的内容生成简洁中文简报。输出纯 JSON：{"title":"","overview":"","changes":["本期最重要的变化"],"actions":["开发者或学习者可执行的建议"]}。不得加入输入中没有的事实。`, user: JSON.stringify({ type, items: snapshots }), maxTokens: type === DigestType.WEEKLY ? 1600 : 1000 });
  await prisma.$transaction(async (tx) => {
    await assertTaskLease(tx);
    await tx.digest.upsert({ where: { key }, update: {}, create: { key, type, title: String(result.title || `${dateKey} 行业简报`), overview: String(result.overview || ""), content: { ...result, items: snapshots }, periodStart, periodEnd: now } });
  });
  return true;
  });
  await finishJob({ prisma, name: `digest-generate-${type.toLowerCase()}`, summary: { key, reused: false, items: snapshots.length, failed: 0 }, startedAt, attempts: 1, output: task.skipped ? 0 : 1 });
} catch (error) {
  await finishJob({ prisma, name: `digest-generate-${type.toLowerCase()}`, summary: { key, reused: false, items: snapshots.length, failed: 1, error: String(error instanceof Error ? error.message : error).slice(0, 500) }, startedAt, attempts: 1, output: 0 });
  await prisma.$disconnect();
  throw error;
}
await prisma.$disconnect();
