import { PrismaClient, EntityType } from "@prisma/client";
import { callModel } from "./model-client.mjs";

const prisma = new PrismaClient();
const batchSize = Number(process.env.ENTITY_BATCH_SIZE || 20);
const analyses = await prisma.analysis.findMany({
  where: { status: "AUTO_PUBLISHED", event: { OR: [{ mentions: { none: {} } }, { timeline: { none: {} } }] } },
  include: { event: { include: { timeline: true, documents: { include: { document: true } } } } },
  orderBy: { analyzedAt: "asc" }, take: batchSize,
});
const model = { key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL };
if (Object.values(model).some((value) => !value)) throw new Error("Entity model configuration is incomplete");
const system = `你是行业知识图谱抽取器。只根据输入材料输出JSON，不补充材料外事实。格式：{"entities":[{"type":"COMPANY|PERSON|PRODUCT|TECHNOLOGY|OPEN_SOURCE_PROJECT","name":"","description":""}],"timeline":[{"occurredAt":"YYYY-MM-DD","label":"","description":"","sourceUrl":""}]}。没有确定日期时 timeline 输出空数组。`;
let extracted = 0, failed = 0;
for (const analysis of analyses) {
  try {
    const material = analysis.event.documents.map(({ document }) => `${document.title}\n发布日期：${document.publishedAt?.toISOString() || "未知"}\n${(document.cleanedContent || document.content || "").slice(0, 7000)}\n来源：${document.url}`).join("\n\n");
    const result = await callModel({ ...model, system, user: `事件：${analysis.event.title}\n分析：${analysis.summary}\n材料：\n${material}`, maxTokens: 900 });
    const entities = Array.isArray(result.entities) ? result.entities : [];
    const timelines = Array.isArray(result.timeline) ? result.timeline : [];
    await prisma.$transaction(async (tx) => {
      for (const item of entities.slice(0, 20)) {
        if (!Object.values(EntityType).includes(item.type) || !item.name) continue;
        const normalized = String(item.name).trim().toLowerCase();
        const entity = await tx.entity.upsert({ where: { type_normalized: { type: item.type, normalized } }, update: { description: String(item.description || "").slice(0, 1000) }, create: { type: item.type, name: String(item.name).trim().slice(0, 200), normalized, description: String(item.description || "").slice(0, 1000) } });
        await tx.entityMention.upsert({ where: { entityId_eventId: { entityId: entity.id, eventId: analysis.eventId } }, update: { context: analysis.summary.slice(0, 500), documentId: analysis.event.documents[0]?.documentId }, create: { entityId: entity.id, eventId: analysis.eventId, documentId: analysis.event.documents[0]?.documentId, context: analysis.summary.slice(0, 500) } });
      }
      const timelineItems = timelines.length > 0 ? timelines : analysis.event.documents
        .filter(({ document }) => document.publishedAt)
        .map(({ document }) => ({ occurredAt: document.publishedAt, label: analysis.event.title, description: analysis.summary, sourceUrl: document.url }));
      for (const item of timelineItems.slice(0, 10)) {
        const date = new Date(item.occurredAt); if (Number.isNaN(date.getTime()) || !item.label || !item.description) continue;
        const sourceUrl = item.sourceUrl ? String(item.sourceUrl).slice(0, 1000) : null;
        const exists = analysis.event.timeline.some((entry) => entry.occurredAt.getTime() === date.getTime() && entry.sourceUrl === sourceUrl);
        if (!exists) await tx.eventTimeline.create({ data: { eventId: analysis.eventId, occurredAt: date, label: String(item.label).slice(0, 200), description: String(item.description).slice(0, 1000), sourceUrl } });
      }
    });
    extracted++; console.log(`${analysis.event.title}: entities=${entities.length} timeline=${timelines.length}`);
  } catch (error) { failed++; console.error(`${analysis.event.title}: ${error.message}`); }
}
console.log({ total: analyses.length, extracted, failed }); await prisma.$disconnect();
