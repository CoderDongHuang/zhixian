CREATE TABLE "AiBudgetDay" (
  "day" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiBudgetDay_pkey" PRIMARY KEY ("day")
);
CREATE TABLE "AiBudgetReservation" (
  "id" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "reservedMicros" BIGINT NOT NULL,
  "chargedMicros" BIGINT NOT NULL,
  "status" TEXT NOT NULL,
  "callId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "AiBudgetReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiBudgetReservation_nonnegative" CHECK ("reservedMicros" > 0 AND "chargedMicros" >= 0),
  CONSTRAINT "AiBudgetReservation_status" CHECK ("status" IN ('RESERVED', 'SETTLED', 'UNCERTAIN', 'OVER_LIMIT'))
);
CREATE UNIQUE INDEX "AiBudgetReservation_callId_key" ON "AiBudgetReservation"("callId");
CREATE INDEX "AiBudgetReservation_day_status_idx" ON "AiBudgetReservation"("day", "status");
CREATE INDEX "AiBudgetReservation_scope_createdAt_idx" ON "AiBudgetReservation"("scope", "createdAt");
ALTER TABLE "AiBudgetReservation" ADD CONSTRAINT "AiBudgetReservation_day_fkey" FOREIGN KEY ("day") REFERENCES "AiBudgetDay"("day") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiBudgetReservation" ADD CONSTRAINT "AiBudgetReservation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "AiCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
