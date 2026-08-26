import { PrismaClient } from "@prisma/client";
import { RETENTION_DAYS, retentionCutoff } from "./retention-policy.mjs";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run") || process.env.CLEANUP_DRY_RUN === "true";
const now = Date.now();
const operations = [
  ["emailOtp", { expiresAt: { lt: retentionCutoff(RETENTION_DAYS.emailOtp, now) } }],
  ["session", { expiresAt: { lt: new Date(now) } }],
  ["miniSession", { OR: [{ expiresAt: { lt: new Date(now) } }, { revokedAt: { lt: retentionCutoff(RETENTION_DAYS.miniSession, now) } }] }],
  ["authThrottle", { updatedAt: { lt: retentionCutoff(RETENTION_DAYS.authThrottle, now) } }],
  ["syncRequest", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.syncRequest, now) } }],
  ["behaviorEvent", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.behaviorEvent, now) } }],
  ["reportExport", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.reportExport, now) } }],
  ["pushDelivery", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.pushDelivery, now) } }],
  ["alertDelivery", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.alertDelivery, now) } }],
  ["emailDelivery", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.emailDelivery, now) } }],
  ["pipelineRun", { finishedAt: { lt: retentionCutoff(RETENTION_DAYS.pipelineRun, now) } }],
  ["securityEvent", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.securityEvent, now) } }],
  ["sourceSnapshot", { fetchedAt: { lt: retentionCutoff(RETENTION_DAYS.sourceSnapshot, now) } }],
  ["trendSnapshot", { observedAt: { lt: retentionCutoff(RETENTION_DAYS.trendSnapshot, now) } }],
  ["trendForecast", { generatedAt: { lt: retentionCutoff(RETENTION_DAYS.trendForecast, now) } }],
  ["researchAgentTask", { createdAt: { lt: retentionCutoff(RETENTION_DAYS.researchAgentTask, now) }, status: { in: ["COMPLETED", "REFUSED", "FAILED", "CANCELLED"] } }],
];

const summary = {};
try {
  for (const [model, where] of operations) {
    const delegate = prisma[model];
    summary[model] = dryRun ? await delegate.count({ where }) : (await delegate.deleteMany({ where })).count;
  }
  const syncCutoff = retentionCutoff(RETENTION_DAYS.syncChange, now);
  if (dryRun) {
    const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "SyncChange" sc WHERE sc."changedAt" < $1 AND sc.sequence <> (SELECT max(latest.sequence) FROM "SyncChange" latest WHERE latest."userId" = sc."userId")`, syncCutoff);
    summary.syncChange = Number(rows[0]?.count || 0);
  } else {
    summary.syncChange = await prisma.$executeRawUnsafe(`DELETE FROM "SyncChange" sc WHERE sc."changedAt" < $1 AND sc.sequence <> (SELECT max(latest.sequence) FROM "SyncChange" latest WHERE latest."userId" = sc."userId")`, syncCutoff);
  }
  console.log(JSON.stringify({ ok: true, dryRun, retentionDays: RETENTION_DAYS, deleted: summary }));
} finally {
  await prisma.$disconnect();
}
