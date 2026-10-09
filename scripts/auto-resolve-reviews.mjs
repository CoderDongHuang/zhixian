import { PrismaClient } from "@prisma/client";
import { callModel } from "./model-client.mjs";
import { finishJob } from "./job-policy.mjs";
import { analysisConfidence, publicationDecision } from "./analysis-policy.mjs";
import { saveCurrentAnalysis } from "./analysis-storage.mjs";
import { normalizeEvidenceCandidates } from "../lib/evidence-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const limit = Math.max(1, Math.min(100, Number(process.env.REVIEW_BATCH_SIZE) || 10));
const ids = await prisma.$queryRaw`SELECT a.id FROM "Event" e CROSS JOIN LATERAL (SELECT * FROM "Analysis" WHERE "eventId" = e.id ORDER BY "analyzedAt" DESC, id DESC LIMIT 1) a WHERE a.status = 'PENDING_REVIEW' ORDER BY a."analyzedAt", a.id LIMIT ${limit}`;
const pending = await prisma.analysis.findMany({ where: { id: { in: ids.map((row) => row.id) } }, include: { event: { include: { documents: { include: { document: { include: { source: true } } } } } } } });
const editor = { key: process.env.ANALYSIS_AI_API_KEY, url: process.env.ANALYSIS_AI_API_URL, model: process.env.ANALYSIS_AI_MODEL };
const verifier = { key: process.env.AI_API_KEY, url: process.env.AI_API_URL, model: process.env.AI_MODEL };
if ([...Object.values(editor), ...Object.values(verifier)].some((value) => !value)) throw new Error("Review model configuration is incomplete");
const editSystem = `你是保守的行业研究编辑。仅依据材料改写，不引入新事实。输出 JSON：{"summary":"","whyImportant":"","impact":"","developerImpact":"","learnerAdvice":"","facts":[],"predictions":[],"importance":0.0,"evidence":[{"quote":"原文中的短句原样引用","stance":"SUPPORT|CONFLICT|CONTEXT"}]}。保留冲突，不得将冲突标记为支持。`;
const verifySystem = `你是独立核验员。输出 JSON：{"factuality":0.0,"relevance":0.0,"completeness":0.0,"unsupportedClaims":[],"notes":""}。只依据材料评分。`;
let published = 0, withheld = 0, failed = 0, superseded = 0;
for (const item of pending) {
  try {
    const materials = item.event.documents.map(({ document }, index) => `[材料 ${index + 1}] 来源=${document.source.name}\n原文=${(document.cleanedContent || document.content || "").slice(0, 9000)}\n译文=${(document.translatedContent || "").slice(0, 9000)}`).join("\n\n");
    const revised = await callModel({ ...editor, system: editSystem, user: `${materials}\n原分析：${item.summary}\n原核验：${item.verificationNotes}`, maxTokens: 2000 });
    const check = await callModel({ ...verifier, system: verifySystem, user: `${materials}\n修订分析：${JSON.stringify(revised)}`, maxTokens: 2000 });
    const unsupported = Array.isArray(check.unsupportedClaims) ? check.unsupportedClaims : ["invalid-verification"];
    const candidates = normalizeEvidenceCandidates(revised.evidence, revised.evidenceQuotes);
    const decision = publicationDecision(item.event.documents, analysisConfidence(item.event.documents, check), unsupported, candidates);
    const status = decision.publish ? "AUTO_PUBLISHED" : "REJECTED";
    const created = await saveCurrentAnalysis(prisma, item.event, {
      summary: String(revised.summary || ""), whyImportant: String(revised.whyImportant || ""), impact: String(revised.impact || ""),
      developerImpact: String(revised.developerImpact || ""), learnerAdvice: String(revised.learnerAdvice || ""),
      facts: JSON.stringify(Array.isArray(revised.facts) ? revised.facts : []), predictions: JSON.stringify(Array.isArray(revised.predictions) ? revised.predictions : []),
      confidence: decision.confidence, status, modelVersion: editor.model, verifierModel: verifier.model, promptVersion: "review-v2",
      verificationNotes: JSON.stringify({ autoResolved: true, replacesAnalysisId: item.id, verification: check, publicationPolicy: decision.reason }),
    }, candidates, Math.max(0, Math.min(1, Number(revised.importance) || item.event.importance)), item.id);
    if (!created) { superseded++; continue; }
    if (decision.publish) published++; else withheld++;
    console.log(`${item.event.title}: confidence=${decision.confidence.toFixed(2)} status=${status}`);
  } catch (error) { failed++; console.error(`${item.event.title}: ${error.message}`); }
}
await finishJob({ prisma, name: "review-auto-resolve", summary: { total: pending.length, published, autoWithheld: withheld, failed, superseded }, startedAt, output: published + withheld });
await prisma.$disconnect();
