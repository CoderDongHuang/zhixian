CREATE TYPE "DigestType" AS ENUM ('MORNING', 'EVENING', 'WEEKLY');
ALTER TABLE "UserPreference" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai';
ALTER TABLE "UserPreference" ADD COLUMN "morningEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "eveningEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "weeklyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "weeklyDay" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "Digest" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "userId" TEXT,
  "type" "DigestType" NOT NULL,
  "title" TEXT NOT NULL,
  "overview" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Digest_key_key" ON "Digest"("key");
CREATE INDEX "Digest_userId_type_createdAt_idx" ON "Digest"("userId", "type", "createdAt");
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
