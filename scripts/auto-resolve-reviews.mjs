import { PrismaClient, ReviewStatus } from "@prisma/client";
import { callModel } from "./model-client.mjs";
import { finishJob } from "./job-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const limit = Number(process.env.REVIEW_BATCH_SIZE ?? 10);
const pending = await prisma.analysis.findMany({
  where: { status: ReviewStatus.PENDING_REVIEW },
  include: { event: { include: { documents: { include: { document: { include: { source: true } } } } } } },
  take: limit,
  orderBy: { analyzedAt: "asc" },
});
const editor = { key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL };
const verifier = { key: process.env.AI_API_KEY, url: process.env.AI_API_URL, model: process.env.AI_MODEL };
const editSystem = `你是保守的行业研究编辑。删除或改写所有没有材料支持的内容，不得引入新事实。输出纯 JSON：{"summary":"","whyImportant":"","impact":"","developerImpact":"","learnerAdvice":"","facts":[],"predictions":[],"importance":0.0}。预测必须明确条件和不确定性。`;
const verifySystem = `你是独立核验员。输出纯 JSON：{"factuality":0.0,"relevance":0.0,"completeness":0.0,"unsupportedClaims":[],"notes":""}。分数为 0 到 1，只依据材料评分。`;
let published = 0, withheld = 0, failed = 0;

for (const item of pending) {
  try {
    const materials = item.event.documents.map(({ document }, index) => `[材料 ${index + 1}] 来源=${document.source.name}\n标题=${document.title}\n原文=${(document.cleanedContent || document.content || "").slice(0, 9000)}\n译文=${(document.translatedContent || "").slice(0, 9000)}`).join("\n\n");
    const existing = { summary: item.summary, whyImportant: item.whyImportant, impact: item.impact, developerImpact: item.developerImpact, learnerAdvice: item.learnerAdvice, facts: JSON.parse(item.facts || "[]"), predictions: JSON.parse(item.predictions || "[]") };
    const revised = await callModel({ ...editor, system: editSystem, user: `${materials}\n\n原分析：${JSON.stringify(existing)}\n\n原核验：${item.verificationNotes}`, maxTokens: 1500 });
    const check = await callModel({ ...verifier, system: verifySystem, user: `${materials}\n\n修订分析：${JSON.stringify(revised)}`, maxTokens: 2000 });
    const trust = item.event.documents.reduce((sum, entry) => sum + entry.document.source.trustScore, 0) / Math.max(item.event.documents.length, 1);
    const factuality = Number(check.factuality) || 0, relevance = Number(check.relevance) || 0, completeness = Number(check.completeness) || 0;
    const confidence = Math.max(0, Math.min(1, factuality * 0.55 + relevance * 0.15 + completeness * 0.1 + trust * 0.2));
    const unsupported = Array.isArray(check.unsupportedClaims) ? check.unsupportedClaims : [];
    const status = confidence >= 0.76 && unsupported.length === 0 ? ReviewStatus.AUTO_PUBLISHED : ReviewStatus.REJECTED;
    await prisma.analysis.update({ where: { id: item.id }, data: { summary: String(revised.summary || item.summary), whyImportant: String(revised.whyImportant || ""), impact: String(revised.impact || ""), developerImpact: String(revised.developerImpact || ""), learnerAdvice: String(revised.learnerAdvice || ""), facts: JSON.stringify(revised.facts || []), predictions: JSON.stringify(revised.predictions || []), confidence, status, verifierModel: verifier.model, verificationNotes: JSON.stringify({ autoResolved: true, notes: check.notes || "", unsupportedClaims: unsupported, factuality, relevance, completeness }) } });
    if (status === ReviewStatus.AUTO_PUBLISHED) {
      const exists = await prisma.feedItem.findFirst({ where: { eventId: item.eventId } });
      if (!exists) await prisma.feedItem.create({ data: { eventId: item.eventId, rank: item.event.importance * confidence } });
      published++;
    } else withheld++;
    console.log(`${item.event.title}: confidence=${confidence.toFixed(2)} status=${status}`);
  } catch (error) { failed++; console.error(`${item.event.title}: ${error.message}`); }
}
await finishJob({ prisma, name: "review-auto-resolve", summary: { total: pending.length, published, autoWithheld: withheld, failed }, startedAt, output: published + withheld });
await prisma.$disconnect();
