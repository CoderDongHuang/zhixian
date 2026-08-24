ALTER TABLE "BehaviorEvent" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "ReportExport" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "BehaviorEvent_dedupeKey_key" ON "BehaviorEvent"("dedupeKey");
CREATE INDEX "BehaviorEvent_createdAt_idx" ON "BehaviorEvent"("createdAt");
CREATE UNIQUE INDEX "ReportExport_userId_idempotencyKey_key" ON "ReportExport"("userId", "idempotencyKey");
CREATE INDEX "ReportExport_createdAt_idx" ON "ReportExport"("createdAt");
CREATE INDEX "EmailOtp_expiresAt_idx" ON "EmailOtp"("expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "SyncChange_changedAt_idx" ON "SyncChange"("changedAt");
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
CREATE INDEX "SourceSnapshot_fetchedAt_idx" ON "SourceSnapshot"("fetchedAt");
CREATE INDEX "PipelineRun_finishedAt_idx" ON "PipelineRun"("finishedAt");

ALTER TABLE "ReportExport"
  ADD CONSTRAINT "ReportExport_digestId_fkey"
  FOREIGN KEY ("digestId") REFERENCES "Digest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
