ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "dailyLearningEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "dailyLearningTime" TEXT NOT NULL DEFAULT '07:30';

CREATE TABLE IF NOT EXISTS "DeviceSubscription" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL, "platform" TEXT NOT NULL DEFAULT 'web',
  "userAgent" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "DeviceSubscription_userId_platform_idx" ON "DeviceSubscription"("userId", "platform");

CREATE TABLE IF NOT EXISTS "BehaviorEvent" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "feedItemId" TEXT, "eventId" TEXT,
  "action" TEXT NOT NULL, "topic" TEXT, "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BehaviorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "BehaviorEvent_userId_createdAt_idx" ON "BehaviorEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "BehaviorEvent_userId_topic_action_idx" ON "BehaviorEvent"("userId", "topic", "action");

CREATE TABLE IF NOT EXISTS "LearningPath" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "goal" TEXT NOT NULL,
  "level" TEXT NOT NULL, "topics" TEXT[], "outline" JSONB NOT NULL, "progress" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "modelVersion" TEXT NOT NULL DEFAULT 'rules-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningPath_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "LearningPath_userId_active_idx" ON "LearningPath"("userId", "active");

CREATE TABLE IF NOT EXISTS "LearningTask" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "pathId" TEXT, "eventId" TEXT,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "reason" TEXT,
  "estimatedMinutes" INTEGER NOT NULL DEFAULT 15, "scheduledFor" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "LearningTask_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "LearningPath"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "LearningTask_userId_scheduledFor_idx" ON "LearningTask"("userId", "scheduledFor");

CREATE TABLE IF NOT EXISTS "ReportExport" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "digestId" TEXT, "template" TEXT NOT NULL,
  "format" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ReportExport_userId_createdAt_idx" ON "ReportExport"("userId", "createdAt");
