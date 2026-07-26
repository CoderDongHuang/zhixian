import { PrismaClient, ProcessingStatus } from "@prisma/client";
import { cleanContent, classifyTopic, createClusterKey, detectLanguage } from "./content-utils.mjs";
import { translateToChinese } from "./translate.mjs";

const prisma = new PrismaClient();
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

    const event = await prisma.event.upsert({ where: { clusterKey }, update: { importance: Math.max(0.5, document.sourceId ? 0.6 : 0.5) }, create: { title: document.title, clusterKey, topic, type: "INDUSTRY_UPDATE", importance: 0.6 } });
    await prisma.$transaction([
      prisma.eventDocument.upsert({ where: { eventId_documentId: { eventId: event.id, documentId: document.id } }, update: {}, create: { eventId: event.id, documentId: document.id } }),
      prisma.rawDocument.update({ where: { id: document.id }, data: { cleanedContent, translatedContent, language, topic, processingStatus, processedAt: new Date(), processingError: null } }),
    ]);
    processingStatus === ProcessingStatus.PROCESSED ? processed++ : waiting++;
  } catch (error) {
    failed++;
    await prisma.rawDocument.update({ where: { id: document.id }, data: { processingStatus: ProcessingStatus.FAILED, processingError: String(error.message).slice(0, 1000), processedAt: new Date() } });
  }
}

console.log({ total: documents.length, processed, waitingTranslation: waiting, failed });
await prisma.$disconnect();
