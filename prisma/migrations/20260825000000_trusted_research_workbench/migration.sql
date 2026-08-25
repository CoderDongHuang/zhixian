CREATE TYPE "EvidenceStance" AS ENUM ('SUPPORT', 'CONFLICT', 'CONTEXT');
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');
CREATE TYPE "ResearchItemType" AS ENUM ('EVENT', 'ENTITY', 'DIGEST');

ALTER TABLE "Evidence" ADD COLUMN "stance" "EvidenceStance" NOT NULL DEFAULT 'SUPPORT';
ALTER TABLE "Feedback"
  ADD COLUMN "correctionStatus" "CorrectionStatus",
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "EntitySubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntitySubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchCollection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResearchCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchCollectionItem" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "targetType" "ResearchItemType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetTitle" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResearchCollectionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchShare" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ResearchShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntitySubscription_userId_entityId_key" ON "EntitySubscription"("userId", "entityId");
CREATE INDEX "EntitySubscription_userId_enabled_idx" ON "EntitySubscription"("userId", "enabled");
CREATE INDEX "EntitySubscription_entityId_enabled_idx" ON "EntitySubscription"("entityId", "enabled");
CREATE INDEX "ResearchCollection_userId_updatedAt_idx" ON "ResearchCollection"("userId", "updatedAt");
CREATE UNIQUE INDEX "ResearchCollectionItem_collectionId_targetType_targetId_key" ON "ResearchCollectionItem"("collectionId", "targetType", "targetId");
CREATE INDEX "ResearchCollectionItem_collectionId_createdAt_idx" ON "ResearchCollectionItem"("collectionId", "createdAt");
CREATE UNIQUE INDEX "ResearchShare_tokenHash_key" ON "ResearchShare"("tokenHash");
CREATE INDEX "ResearchShare_collectionId_createdAt_idx" ON "ResearchShare"("collectionId", "createdAt");
CREATE INDEX "ResearchShare_createdById_createdAt_idx" ON "ResearchShare"("createdById", "createdAt");
CREATE UNIQUE INDEX "ResearchNotification_feedbackId_key" ON "ResearchNotification"("feedbackId");
CREATE INDEX "ResearchNotification_userId_readAt_createdAt_idx" ON "ResearchNotification"("userId", "readAt", "createdAt");

ALTER TABLE "EntitySubscription" ADD CONSTRAINT "EntitySubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntitySubscription" ADD CONSTRAINT "EntitySubscription_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchCollection" ADD CONSTRAINT "ResearchCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchCollectionItem" ADD CONSTRAINT "ResearchCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ResearchCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchShare" ADD CONSTRAINT "ResearchShare_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ResearchCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchShare" ADD CONSTRAINT "ResearchShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchNotification" ADD CONSTRAINT "ResearchNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchNotification" ADD CONSTRAINT "ResearchNotification_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Feedback" ALTER COLUMN "updatedAt" DROP DEFAULT;
