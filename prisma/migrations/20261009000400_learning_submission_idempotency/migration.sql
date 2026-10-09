ALTER TABLE "LearningAttempt" ADD COLUMN "requestId" TEXT,
  ADD COLUMN "requestHash" TEXT, ADD COLUMN "response" JSONB;
CREATE UNIQUE INDEX "LearningAttempt_userId_taskId_requestId_key"
  ON "LearningAttempt"("userId", "taskId", "requestId");
