CREATE TYPE "TrendCategory" AS ENUM ('GITHUB', 'MODEL_PRODUCT', 'PAPER', 'JOB');

CREATE TABLE "TrendSubject" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "TrendCategory" NOT NULL,
  "description" TEXT,
  "sourceName" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceLicense" TEXT,
  "methodology" TEXT NOT NULL,
  "entityId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrendSubject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrendSnapshot" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "windowDays" INTEGER NOT NULL DEFAULT 30,
  "metrics" JSONB NOT NULL,
  "dimensions" JSONB,
  "dataGaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "methodologyVersion" TEXT NOT NULL DEFAULT 'trend-v1',
  "sourceUrl" TEXT NOT NULL,
  "sourceFetchedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrendSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrendForecast" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "horizonDays" INTEGER NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "targetAt" TIMESTAMP(3) NOT NULL,
  "forecastValue" DOUBLE PRECISION NOT NULL,
  "lowerBound" DOUBLE PRECISION NOT NULL,
  "upperBound" DOUBLE PRECISION NOT NULL,
  "confidenceLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "method" TEXT NOT NULL,
  "backtestMae" DOUBLE PRECISION NOT NULL,
  "backtestMape" DOUBLE PRECISION,
  "sampleSize" INTEGER NOT NULL,
  "trainingWindowStart" TIMESTAMP(3) NOT NULL,
  "trainingWindowEnd" TIMESTAMP(3) NOT NULL,
  "invalidationRule" TEXT NOT NULL,
  CONSTRAINT "TrendForecast_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrendSubject_slug_key" ON "TrendSubject"("slug");
CREATE INDEX "TrendSubject_category_enabled_updatedAt_idx" ON "TrendSubject"("category", "enabled", "updatedAt");
CREATE INDEX "TrendSubject_entityId_idx" ON "TrendSubject"("entityId");
CREATE UNIQUE INDEX "TrendSnapshot_subjectId_observedAt_key" ON "TrendSnapshot"("subjectId", "observedAt");
CREATE INDEX "TrendSnapshot_subjectId_observedAt_idx" ON "TrendSnapshot"("subjectId", "observedAt");
CREATE INDEX "TrendSnapshot_observedAt_idx" ON "TrendSnapshot"("observedAt");
CREATE INDEX "TrendForecast_subjectId_metricKey_generatedAt_idx" ON "TrendForecast"("subjectId", "metricKey", "generatedAt");
CREATE INDEX "TrendForecast_targetAt_idx" ON "TrendForecast"("targetAt");
CREATE UNIQUE INDEX "TrendForecast_subject_metric_horizon_training_end_key" ON "TrendForecast"("subjectId", "metricKey", "horizonDays", "trainingWindowEnd");

ALTER TABLE "TrendSubject" ADD CONSTRAINT "TrendSubject_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "TrendSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrendForecast" ADD CONSTRAINT "TrendForecast_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "TrendSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
