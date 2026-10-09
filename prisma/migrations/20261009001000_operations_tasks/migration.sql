CREATE TABLE "PipelineTask" (
  "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL, "revision" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "token" TEXT, "leaseUntil" TIMESTAMP(3), "retryAt" TIMESTAMP(3), "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PipelineTask_name_status_retryAt_idx" ON "PipelineTask"("name", "status", "retryAt");
CREATE INDEX "PipelineTask_status_leaseUntil_idx" ON "PipelineTask"("status", "leaseUntil");
CREATE TABLE "PipelineAttempt" (
  "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL REFERENCES "PipelineTask"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL, "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "PipelineAttempt_taskId_startedAt_idx" ON "PipelineAttempt"("taskId", "startedAt");
CREATE TABLE "AiCall" (
  "id" TEXT PRIMARY KEY, "attemptId" TEXT REFERENCES "PipelineAttempt"("id") ON DELETE SET NULL,
  "scope" TEXT NOT NULL, "model" TEXT NOT NULL, "provider" TEXT NOT NULL, "status" TEXT NOT NULL,
  "httpStatus" INTEGER, "inputTokens" INTEGER, "outputTokens" INTEGER, "costUsd" DOUBLE PRECISION,
  "pricingVersion" TEXT, "durationMs" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiCall_scope_createdAt_idx" ON "AiCall"("scope", "createdAt");
CREATE INDEX "AiCall_createdAt_idx" ON "AiCall"("createdAt");
