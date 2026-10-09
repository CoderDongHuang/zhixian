import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { configuredEmbeddingDimensions, validEmbeddingVector } from "../lib/embedding-policy.mjs";
import { runTask, assertTaskLease, replayTarget, requireReplaySelection } from "../lib/pipeline-tasks.mjs";
import { trackedAiFetch } from "../lib/ai-telemetry.mjs";
import { finishJob } from "./job-policy.mjs";

const prisma = new PrismaClient();
const startedAt = new Date();
const replay = await replayTarget(prisma, "content-embed");
const model = replay ? JSON.parse(replay.revision)[1] : process.env.EMBEDDING_MODEL || "text-embedding-v3";
const dimensions = configuredEmbeddingDimensions();
if (!process.env.EMBEDDING_API_KEY || !process.env.EMBEDDING_API_URL) throw new Error("Embedding configuration is incomplete");
let created = 0, failed = 0;
try {
  const rows = await prisma.rawDocument.findMany({ where: { processingStatus: "PROCESSED", ...(replay ? { id: replay.resourceId } : {}), embeddings: { none: { model } } }, orderBy: { fetchedAt: "asc" }, take: Number(process.env.EMBEDDING_BATCH_SIZE || 25) });
  requireReplaySelection(replay, rows.filter((row) => !replay || JSON.stringify([row.materialRevision, model]) === replay.revision));
  for (const row of rows) {
    try {
      await runTask(prisma, { name: "content-embed", resourceId: row.id, revision: JSON.stringify([row.materialRevision, model]) }, async () => {
        const text = `${row.title}\n\n${String(row.cleanedContent || row.content || "").slice(0, 12000)}`;
        const contentHash = createHash("sha256").update(`${row.id}:${row.materialRevision}:${model}:${text}`).digest("hex");
        const response = await trackedAiFetch(prisma, "content-embed", model)(process.env.EMBEDDING_API_URL, { method: "POST", headers: { Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [text], dimensions }), signal: AbortSignal.timeout(60000) });
        const result = await response.json();
        if (!response.ok) throw new Error(`Embedding HTTP ${response.status}`);
        const vector = result.data?.[0]?.embedding;
        if (!validEmbeddingVector(vector, dimensions)) throw new Error(`Embedding response must contain ${dimensions} finite values`);
        return prisma.$transaction(async (tx) => {
          await assertTaskLease(tx);
          const [current] = await tx.$queryRaw`SELECT "materialRevision", "processingStatus" FROM "RawDocument" WHERE id = ${row.id} FOR UPDATE`;
          if (current?.materialRevision !== row.materialRevision || current?.processingStatus !== "PROCESSED") return false;
          created += await tx.$executeRaw`INSERT INTO "Embedding" (id, "documentId", "contentHash", model, dimensions, vector, "createdAt") VALUES (gen_random_uuid()::text, ${row.id}, ${contentHash}, ${model}, ${dimensions}, ${`[${vector.join(",")}]`}::vector, now()) ON CONFLICT ("contentHash") DO NOTHING`;
          return true;
        });
      });
    } catch (error) { failed++; console.error(`${row.id}: ${error.message}`); }
  }
  await finishJob({ prisma, name: "content-embed", summary: { total: rows.length, created, failed }, startedAt, output: created });
} finally { await prisma.$disconnect(); }
