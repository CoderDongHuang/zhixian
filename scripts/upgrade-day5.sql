ALTER TABLE "Analysis" ADD COLUMN "whyImportant" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "developerImpact" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "learnerAdvice" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "verificationNotes" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "verifierModel" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "promptVersion" TEXT NOT NULL DEFAULT 'day5-v1';
ALTER TABLE "Analysis" ADD COLUMN "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
