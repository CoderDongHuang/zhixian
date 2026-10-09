import { PrismaClient, EntityType } from "@prisma/client";
import { callModel } from "./model-client.mjs";
import { finishJob } from "./job-policy.mjs";
import { runTask, assertTaskLease, replayTarget, requireReplaySelection } from "../lib/pipeline-tasks.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const batchSize = Number(process.env.ENTITY_BATCH_SIZE || 20);
const replay = await replayTarget(prisma, "entity-extract");
const events = await prisma.event.findMany({
  where: { isPublic: true, ...(replay ? { id: replay.resourceId } : {}), ...(replay || process.env.ENTITY_FORCE_RELATIONS === "true" ? {} : { OR: [{ mentions: { none: {} } }, { timeline: { none: {} } }] }) },
  include: { analyses: { orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 1 }, timeline: true, documents: { include: { document: true } } },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize,
});
const analyses = events.flatMap((event) => event.analyses.map((analysis) => ({ ...analysis, event })));
requireReplaySelection(replay, analyses.filter((item) => !replay || item.id === replay.revision));
const model = { key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL };
if (Object.values(model).some((value) => !value)) throw new Error("Entity model configuration is incomplete");
const system = `你是行业知识图谱抽取器。只根据输入材料输出JSON，不补充材料外事实。格式：{"entities":[{"type":"COMPANY|PERSON|PRODUCT|TECHNOLOGY|OPEN_SOURCE_PROJECT","name":"","description":"","aliases":[""]}],"relations":[{"from":"实体名","to":"实体名","relation":"UPSTREAM|DOWNSTREAM|COMPETES_WITH|COOPERATES_WITH|REFERENCES","confidence":0.8,"evidence":"材料中的依据","sourceUrl":""}],"timeline":[{"occurredAt":"YYYY-MM-DD","label":"","description":"","sourceUrl":""}]}。关系两端必须出现在 entities 中；没有确定关系或日期时输出空数组。`;
let extracted = 0, failed = 0;
for (const analysis of analyses) {
  try {
    await runTask(prisma, { name: "entity-extract", resourceId: analysis.eventId, revision: analysis.id }, async () => {
    const material = analysis.event.documents.map(({ document }) => `${document.title}\n发布日期：${document.publishedAt?.toISOString() || "未知"}\n${(document.cleanedContent || document.content || "").slice(0, 7000)}\n来源：${document.url}`).join("\n\n");
    const result = await callModel({ ...model, system, user: `事件：${analysis.event.title}\n分析：${analysis.summary}\n材料：\n${material}`, maxTokens: 900 });
    const entities = Array.isArray(result.entities) ? result.entities : [];
    const relations = Array.isArray(result.relations) ? result.relations : [];
    const timelines = Array.isArray(result.timeline) ? result.timeline : [];
    await prisma.$transaction(async (tx) => {
      await assertTaskLease(tx);
      const [current] = await tx.$queryRaw`SELECT "isPublic", "materialRevision" FROM "Event" WHERE id = ${analysis.eventId} FOR UPDATE`;
      const latest = await tx.analysis.findFirst({ where: { eventId: analysis.eventId }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }] });
      if (!current?.isPublic || current.materialRevision !== analysis.inputRevision || latest?.id !== analysis.id) throw new Error("Analysis was withdrawn or superseded during extraction");
      const entityByName = new Map();
      for (const item of entities.slice(0, 20)) {
        if (!Object.values(EntityType).includes(item.type) || !item.name) continue;
        const normalized = String(item.name).trim().toLowerCase();
        const entity = await tx.entity.upsert({ where: { type_normalized: { type: item.type, normalized } }, update: { description: String(item.description || "").slice(0, 1000) }, create: { type: item.type, name: String(item.name).trim().slice(0, 200), normalized, description: String(item.description || "").slice(0, 1000) } });
        entityByName.set(normalized, entity);
        const aliases = Array.isArray(item.aliases) ? item.aliases : [];
        for (const aliasValue of aliases.slice(0, 10)) {
          const alias = String(aliasValue).trim().slice(0, 200); const aliasNormalized = alias.toLowerCase().replace(/\s+/g, " ");
          if (alias && aliasNormalized !== normalized) await tx.entityAlias.upsert({ where: { entityId_normalized: { entityId: entity.id, normalized: aliasNormalized } }, update: { alias }, create: { entityId: entity.id, alias, normalized: aliasNormalized } });
        }
        await tx.entityMention.upsert({ where: { entityId_eventId: { entityId: entity.id, eventId: analysis.eventId } }, update: { context: analysis.summary.slice(0, 500), documentId: analysis.event.documents[0]?.documentId }, create: { entityId: entity.id, eventId: analysis.eventId, documentId: analysis.event.documents[0]?.documentId, context: analysis.summary.slice(0, 500) } });
      }
      for (const item of relations.slice(0, 30)) {
        const from = entityByName.get(String(item.from || "").trim().toLowerCase()); const to = entityByName.get(String(item.to || "").trim().toLowerCase());
        const relation = String(item.relation || "").trim().toUpperCase();
        if (!from || !to || from.id === to.id || !["UPSTREAM", "DOWNSTREAM", "COMPETES_WITH", "COOPERATES_WITH", "REFERENCES"].includes(relation)) continue;
        const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0.5));
        await tx.entityRelation.upsert({ where: { fromEntityId_toEntityId_relation: { fromEntityId: from.id, toEntityId: to.id, relation } }, update: { confidence, evidence: String(item.evidence || "").slice(0, 1000), sourceUrl: item.sourceUrl ? String(item.sourceUrl).slice(0, 1000) : null }, create: { fromEntityId: from.id, toEntityId: to.id, relation, confidence, evidence: String(item.evidence || "").slice(0, 1000), sourceUrl: item.sourceUrl ? String(item.sourceUrl).slice(0, 1000) : null } });
      }
      for (const entity of entityByName.values()) {
        const previous = await tx.entityMention.findFirst({ where: { entityId: entity.id, eventId: { not: analysis.eventId }, event: { createdAt: { lt: analysis.event.createdAt } } }, orderBy: { event: { createdAt: "desc" } } });
        if (previous) await tx.eventRelation.upsert({ where: { fromEventId_toEventId: { fromEventId: previous.eventId, toEventId: analysis.eventId } }, update: { relation: "FOLLOW_UP", confidence: 0.6 }, create: { fromEventId: previous.eventId, toEventId: analysis.eventId, relation: "FOLLOW_UP", confidence: 0.6 } });
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
    extracted++; console.log(`${analysis.event.title}: entities=${entities.length} relations=${relations.length} timeline=${timelines.length}`);
    return true;
    });
  } catch (error) { failed++; console.error(`${analysis.event.title}: ${error.message}`); }
}
await finishJob({ prisma, name: "entity-extract", summary: { total: analyses.length, extracted, failed }, startedAt, output: extracted });
await prisma.$disconnect();
