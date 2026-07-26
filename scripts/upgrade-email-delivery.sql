CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED');
ALTER TABLE "UserPreference" ADD COLUMN "emailEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "digestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" "DeliveryStatus" NOT NULL,
  "providerId" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailDelivery_digestId_userId_key" ON "EmailDelivery"("digestId", "userId");
CREATE INDEX "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "Digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
