import { PrismaClient, ReviewStatus } from "@prisma/client";
import { callModel } from "./model-client.mjs";
import { finishJob } from "./job-policy.mjs";
import { publicationDecision } from "./analysis-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const batchSize = Number(process.env.ANALYSIS_BATCH_SIZE ?? 10);
const events = await prisma.event.findMany({
  where: { analyses: { none: {} } },
  include: { documents: { include: { document: { include: { source: true } } } } },
  orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
  take: batchSize,
});

const primary = { key: process.env.AI_API_KEY, url: process.env.AI_API_URL, model: process.env.AI_MODEL };
const verifier = { key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL };
if (Object.values(primary).some((value) => !value) || Object.values(verifier).some((value) => !value)) throw new Error("Analysis model configuration is incomplete");

const primarySystem = `你是严谨的 AI 行业研究分析师。只能依据材料，不得补充材料中没有的事实。事实、分析、预测必须分开。输出纯 JSON：
{"summary":"中文摘要","whyImportant":"为什么重要","impact":"行业影响","developerImpact":"对开发者的影响","learnerAdvice":"对学习者的建议","facts":["可核验事实"],"predictions":["有条件的趋势判断"],"evidenceQuotes":["原文中的英文短句原样引用"],"importance":0.0}
importance 为 0 到 1。预测必须使用可能、如果、取决于等不确定性表达。`;
const verifierSystem = `你是独立事实核验员。核对分析是否完全受到材料支持。输出纯 JSON：
{"factuality":0.0,"relevance":0.0,"completeness":0.0,"unsupportedClaims":["未获材料支持的表述"],"notes":"中文核验说明"}
所有分数为 0 到 1。不要因为文风流畅而提高事实分。`;

let published = 0, pending = 0, failed = 0;
for (const event of events) {
  try {
    const materials = event.documents.map(({ document }, index) => {
      const content = document.cleanedContent || document.content || "";
      return `[材料 ${index + 1}]\n来源：${document.source.name}\n标题：${document.title}\n原文：${content.slice(0, 9000)}\n中文译文：${(document.translatedContent || "").slice(0, 9000)}`;
    }).join("\n\n");
    const analysis = await callModel({ ...primary, system: primarySystem, user: materials });
    const verification = await callModel({ ...verifier, system: verifierSystem, user: `${materials}\n\n待核验分析：\n${JSON.stringify(analysis)}`, maxTokens: 800 });
    const trustScore = event.documents.reduce((sum, item) => sum + item.document.source.trustScore, 0) / Math.max(event.documents.length, 1);
    const factuality = Number(verification.factuality) || 0;
    const relevance = Number(verification.relevance) || 0;
    const completeness = Number(verification.completeness) || 0;
    const calculatedConfidence = factuality * 0.5 + relevance * 0.15 + completeness * 0.15 + trustScore * 0.2;
    const unsupportedClaims = Array.isArray(verification.unsupportedClaims) ? verification.unsupportedClaims : [];
    const decision = publicationDecision(event.documents, calculatedConfidence, unsupportedClaims);
    const confidence = decision.confidence;
    const status = decision.publish ? ReviewStatus.AUTO_PUBLISHED : ReviewStatus.PENDING_REVIEW;
    const facts = Array.isArray(analysis.facts) ? analysis.facts : [];
    const predictions = Array.isArray(analysis.predictions) ? analysis.predictions : [];
    const created = await prisma.analysis.create({ data: {
      eventId: event.id, summary: String(analysis.summary ?? ""), whyImportant: String(analysis.whyImportant ?? ""), impact: String(analysis.impact ?? ""),
      developerImpact: String(analysis.developerImpact ?? ""), learnerAdvice: String(analysis.learnerAdvice ?? ""), facts: JSON.stringify(facts), predictions: JSON.stringify(predictions),
      verificationNotes: JSON.stringify({ notes: verification.notes ?? "", unsupportedClaims, factuality, relevance, completeness, publicationPolicy: decision.reason }), confidence, status,
      modelVersion: primary.model, verifierModel: verifier.model, promptVersion: "day5-v1",
    } });
    const quotes = Array.isArray(analysis.evidenceQuotes) ? analysis.evidenceQuotes : [];
    for (const quote of quotes.slice(0, 5)) {
      const matching = event.documents.find(({ document }) => (document.cleanedContent || document.content || "").includes(quote));
      if (matching) await prisma.evidence.create({ data: { analysisId: created.id, documentId: matching.document.id, quote } });
    }
    const importance = Math.max(0, Math.min(1, Number(analysis.importance) || event.importance));
    await prisma.event.update({ where: { id: event.id }, data: { importance } });
    if (status === ReviewStatus.AUTO_PUBLISHED) {
      const exists = await prisma.feedItem.findFirst({ where: { eventId: event.id } });
      if (!exists) await prisma.feedItem.create({ data: { eventId: event.id, rank: importance * confidence } });
      published++;
    }
    else pending++;
    console.log(`${event.title}: confidence=${confidence.toFixed(2)} status=${status}`);
  } catch (error) {
    failed++;
    console.error(`${event.title}: ${error.message}`);
  }
}

await finishJob({ prisma, name: "content-analyze", summary: { total: events.length, published, pendingReview: pending, failed }, startedAt, output: published + pending });
await prisma.$disconnect();
