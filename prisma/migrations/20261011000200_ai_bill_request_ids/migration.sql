ALTER TABLE "AiCall" ADD COLUMN "providerRequestId" TEXT;
CREATE INDEX "AiCall_provider_providerRequestId_idx" ON "AiCall"("provider", "providerRequestId");
