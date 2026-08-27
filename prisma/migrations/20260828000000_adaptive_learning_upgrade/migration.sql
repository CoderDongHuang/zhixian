CREATE TYPE "LearningTaskType" AS ENUM ('READING', 'PRACTICE', 'CODE', 'REVIEW');

ALTER TABLE "LearningTask"
  ADD COLUMN "entityId" TEXT,
  ADD COLUMN "taskType" "LearningTaskType" NOT NULL DEFAULT 'READING',
  ADD COLUMN "prerequisiteTaskId" TEXT,
  ADD COLUMN "exercise" JSONB,
  ADD COLUMN "qualityScore" INTEGER,
  ADD COLUMN "selfRating" INTEGER,
  ADD COLUMN "reflection" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextReviewAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

UPDATE "LearningTask" SET "eventId" = NULL
WHERE "eventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Event" WHERE "Event"."id" = "LearningTask"."eventId");

UPDATE "LearningTask" SET "qualityScore" = 60 WHERE "completedAt" IS NOT NULL AND "qualityScore" IS NULL;

UPDATE "LearningPath" AS path SET "progress" = COALESCE((
  SELECT ROUND(AVG(CASE WHEN task."completedAt" IS NULL THEN 0 ELSE COALESCE(task."qualityScore", 60) END))::INTEGER
  FROM "LearningTask" AS task WHERE task."pathId" = path."id"
), 0);

ALTER TABLE "LearningTask"
  ADD CONSTRAINT "LearningTask_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningTask_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningTask_prerequisiteTaskId_fkey" FOREIGN KEY ("prerequisiteTaskId") REFERENCES "LearningTask"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningTask_qualityScore_check" CHECK ("qualityScore" IS NULL OR "qualityScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "LearningTask_selfRating_check" CHECK ("selfRating" IS NULL OR "selfRating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "LearningTask_attemptCount_check" CHECK ("attemptCount" >= 0);

CREATE TABLE "LearningAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "score" INTEGER NOT NULL,
  "maxScore" INTEGER NOT NULL,
  "qualityScore" INTEGER NOT NULL,
  "feedback" JSONB NOT NULL,
  "incorrectConcepts" TEXT[],
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "LearningTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningAttempt_score_check" CHECK ("score" >= 0 AND "maxScore" > 0 AND "score" <= "maxScore"),
  CONSTRAINT "LearningAttempt_qualityScore_check" CHECK ("qualityScore" BETWEEN 0 AND 100)
);

CREATE TABLE "LearningReview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "concept" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "options" JSONB,
  "correctAnswers" JSONB NOT NULL,
  "intervalDays" INTEGER NOT NULL DEFAULT 1,
  "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  "repetition" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "lastReviewedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "LearningTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningReview_intervalDays_check" CHECK ("intervalDays" BETWEEN 1 AND 90),
  CONSTRAINT "LearningReview_easeFactor_check" CHECK ("easeFactor" BETWEEN 1.3 AND 3.0),
  CONSTRAINT "LearningReview_repetition_check" CHECK ("repetition" >= 0)
);

CREATE INDEX "LearningTask_userId_taskType_scheduledFor_idx" ON "LearningTask"("userId", "taskType", "scheduledFor");
CREATE INDEX "LearningTask_eventId_idx" ON "LearningTask"("eventId");
CREATE INDEX "LearningTask_entityId_idx" ON "LearningTask"("entityId");
CREATE INDEX "LearningTask_prerequisiteTaskId_idx" ON "LearningTask"("prerequisiteTaskId");
CREATE INDEX "LearningAttempt_userId_submittedAt_idx" ON "LearningAttempt"("userId", "submittedAt");
CREATE INDEX "LearningAttempt_taskId_submittedAt_idx" ON "LearningAttempt"("taskId", "submittedAt");
CREATE UNIQUE INDEX "LearningReview_userId_taskId_concept_key" ON "LearningReview"("userId", "taskId", "concept");
CREATE INDEX "LearningReview_userId_dueAt_resolvedAt_idx" ON "LearningReview"("userId", "dueAt", "resolvedAt");
CREATE INDEX "LearningReview_taskId_idx" ON "LearningReview"("taskId");
