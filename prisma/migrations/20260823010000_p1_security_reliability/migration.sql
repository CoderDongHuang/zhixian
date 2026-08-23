-- DropIndex
DROP INDEX "RawDocument_contentHash_key";

-- AlterTable
ALTER TABLE "EmailOtp" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "etag" TEXT,
ADD COLUMN     "fetchVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFetchedAt" TIMESTAMP(3),
ADD COLUMN     "lastModified" TEXT;

-- AlterTable: backfill before enforcing NOT NULL so existing production rows remain valid.
ALTER TABLE "RawDocument" ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "RawDocument" SET "updatedAt" = COALESCE("fetchedAt", CURRENT_TIMESTAMP);
ALTER TABLE "RawDocument" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "EventDocument" ADD COLUMN     "clusterMethod" TEXT NOT NULL DEFAULT 'ORDERED_TITLE_V2',
ADD COLUMN     "clusterReason" TEXT,
ADD COLUMN     "clusterScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSnapshot" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "contentHash" TEXT NOT NULL,
    "metrics" JSONB,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputCount" INTEGER NOT NULL DEFAULT 0,
    "outputCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthThrottle_scope_blockedUntil_idx" ON "AuthThrottle"("scope", "blockedUntil");

-- CreateIndex
CREATE INDEX "AuthThrottle_updatedAt_idx" ON "AuthThrottle"("updatedAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_kind_createdAt_idx" ON "SecurityEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_subjectHash_createdAt_idx" ON "SecurityEvent"("subjectHash", "createdAt");

-- CreateIndex
CREATE INDEX "SourceSnapshot_sourceId_fetchedAt_idx" ON "SourceSnapshot"("sourceId", "fetchedAt");

-- CreateIndex
CREATE INDEX "SourceSnapshot_url_fetchedAt_idx" ON "SourceSnapshot"("url", "fetchedAt");

-- CreateIndex
CREATE INDEX "SourceSnapshot_documentId_fetchedAt_idx" ON "SourceSnapshot"("documentId", "fetchedAt");

-- CreateIndex
CREATE INDEX "PipelineRun_name_finishedAt_idx" ON "PipelineRun"("name", "finishedAt");

-- CreateIndex
CREATE INDEX "PipelineRun_status_finishedAt_idx" ON "PipelineRun"("status", "finishedAt");

-- CreateIndex
CREATE INDEX "RawDocument_contentHash_idx" ON "RawDocument"("contentHash");

-- CreateIndex
CREATE INDEX "RawDocument_sourceId_fetchedAt_idx" ON "RawDocument"("sourceId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "SourceSnapshot" ADD CONSTRAINT "SourceSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSnapshot" ADD CONSTRAINT "SourceSnapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RawDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
