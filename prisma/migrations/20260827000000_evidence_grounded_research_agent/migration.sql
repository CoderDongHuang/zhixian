CREATE TYPE "ResearchAgentMode" AS ENUM ('QUESTION', 'COMPARE', 'CHANGES_30D');
CREATE TYPE "ResearchAgentStatus" AS ENUM ('AWAITING_CONFIRMATION', 'RUNNING', 'COMPLETED', 'REFUSED', 'FAILED', 'CANCELLED');

CREATE TABLE "ResearchAgentTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "mode" "ResearchAgentMode" NOT NULL,
  "status" "ResearchAgentStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
  "outline" JSONB NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "answer" JSONB,
  "refusalReason" TEXT,
  "modelVersion" TEXT,
  "error" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResearchAgentTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchAgentEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "status" "ResearchAgentStatus" NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchAgentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchAgentTask_userId_createdAt_idx" ON "ResearchAgentTask"("userId", "createdAt");
CREATE INDEX "ResearchAgentTask_collectionId_createdAt_idx" ON "ResearchAgentTask"("collectionId", "createdAt");
CREATE INDEX "ResearchAgentTask_status_updatedAt_idx" ON "ResearchAgentTask"("status", "updatedAt");
CREATE INDEX "ResearchAgentEvent_taskId_createdAt_idx" ON "ResearchAgentEvent"("taskId", "createdAt");
CREATE INDEX "ResearchAgentEvent_createdAt_idx" ON "ResearchAgentEvent"("createdAt");

ALTER TABLE "ResearchAgentTask" ADD CONSTRAINT "ResearchAgentTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchAgentTask" ADD CONSTRAINT "ResearchAgentTask_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ResearchCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchAgentEvent" ADD CONSTRAINT "ResearchAgentEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchAgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
