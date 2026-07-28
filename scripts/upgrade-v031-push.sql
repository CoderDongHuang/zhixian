DO $$ BEGIN
  CREATE TYPE "PushDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "PushDelivery" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "digestId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "endpointHash" TEXT NOT NULL,
  "status" "PushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "providerId" TEXT,
  "error" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PushDelivery_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "Digest"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushDelivery_deviceId_digestId_key" ON "PushDelivery"("deviceId", "digestId");
CREATE INDEX IF NOT EXISTS "PushDelivery_status_nextAttemptAt_idx" ON "PushDelivery"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "PushDelivery_userId_createdAt_idx" ON "PushDelivery"("userId", "createdAt");
