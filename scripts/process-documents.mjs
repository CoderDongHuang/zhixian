import { PrismaClient, ProcessingStatus } from "@prisma/client";
import { bestTitleMatch, cleanContent, classifyTopic, createClusterKey, detectLanguage } from "./content-utils.mjs";
import { finishJob } from "./job-policy.mjs";
import { translateToChinese } from "./translate.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const batchSize = Number(process.env.PROCESS_BATCH_SIZE ?? 50);
const documents = await prisma.rawDocument.findMany({ where: { processingStatus: { in: [ProcessingStatus.PENDING, ProcessingStatus.WAITING_TRANSLATION] } }, orderBy: { fetchedAt: "asc" }, take: batchSize });
let processed = 0, waiting = 0, failed = 0;

for (const document of documents) {
  try {
    const cleanedContent = cleanContent(document.content ?? "");
    const language = detectLanguage(`${document.title} ${cleanedContent}`);
    const topic = classifyTopic(document.title, cleanedContent);
    const clusterKey = createClusterKey(document.title);
    let translatedContent = document.translatedContent;
    if (language === "EN" && !translatedContent) translatedContent = await translateToChinese(`${document.title}\n\n${cleanedContent}`);
    const processingStatus = language === "EN" && !translatedContent ? ProcessingStatus.WAITING_TRANSLATION : ProcessingStatus.PROCESSED;

    const exact = await prisma.event.findUnique({ where: { clusterKey } });
    const candidates = exact ? [] : await prisma.event.findMany({ where: { topic, createdAt: { gte: new Date(Date.now() - 72 * 60 * 60_000) } }, orderBy: { createdAt: "desc" }, take: 50 });
    const matched = exact ? { event: exact, score: 1 } : bestTitleMatch(document.title, candidates);
    const event = matched?.event || await prisma.event.create({ data: { title: document.title, clusterKey, topic, type: "INDUSTRY_UPDATE", importance: 0.6 } });
    const clusterMethod = exact ? "EXACT_ORDERED_TITLE_V2" : matched ? "TIME_WINDOW_TITLE_V2" : "ORDERED_TITLE_V2";
    const clusterScore = matched?.score ?? 1;
    const clusterReason = exact ? "existing ordered-title cluster" : matched ? `72h topic candidate; ordered-title similarity=${matched.score.toFixed(3)}` : "new ordered-title cluster";
    await prisma.$transaction([
      prisma.eventDocument.deleteMany({ where: { documentId: document.id, eventId: { not: event.id } } }),
      prisma.eventDocument.upsert({ where: { eventId_documentId: { eventId: event.id, documentId: document.id } }, update: { clusterMethod, clusterScore, clusterReason }, create: { eventId: event.id, documentId: document.id, clusterMethod, clusterScore, clusterReason } }),
      prisma.rawDocument.update({ where: { id: document.id }, data: { cleanedContent, translatedContent, language, topic, processingStatus, processedAt: new Date(), processingError: null } }),
    ]);
    processingStatus === ProcessingStatus.PROCESSED ? processed++ : waiting++;
  } catch (error) {
    failed++;
    await prisma.rawDocument.update({ where: { id: document.id }, data: { processingStatus: ProcessingStatus.FAILED, processingError: String(error.message).slice(0, 1000), processedAt: new Date() } });
  }
}

await finishJob({ prisma, name: "content-process", summary: { total: documents.length, processed, waitingTranslation: waiting, failed }, startedAt, output: processed + waiting });
await prisma.$disconnect();
