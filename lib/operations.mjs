import { createHash, timingSafeEqual } from "node:crypto";

export function monitorAuthorized(authorization, token) {
  if (!token || token.length < 24 || !authorization?.startsWith("Bearer ")) return false;
  const hash = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(authorization.slice(7)), hash(token));
}

export function pipelineState(env = process.env) {
  return ["active", "paused"].includes(env.CONTENT_PIPELINE_STATE) ? env.CONTENT_PIPELINE_STATE : "unknown";
}

export function evaluateOperations(metrics, env = process.env, now = new Date()) {
  const state = pipelineState(env);
  const ageHours = (date) => date && Number.isFinite(new Date(date).getTime()) ? Math.max(0, (now - new Date(date)) / 3600000) : null;
  const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const maxSourceAgeHours = positive(env.MONITOR_SOURCE_MAX_AGE_HOURS, 24);
  const maxPublicationAgeHours = positive(env.MONITOR_PUBLICATION_MAX_AGE_HOURS, 48);
  const staleSources = metrics.sources.filter((source) => ageHours(source.lastFetchedAt) === null || ageHours(source.lastFetchedAt) > maxSourceAgeHours).map((source) => source.id);
  const publicationAgeHours = ageHours(metrics.latestPublishedAt);
  const failureRate = metrics.attempts ? metrics.failedAttempts / metrics.attempts : 0;
  const reasons = [];
  if (state === "unknown") reasons.push("PIPELINE_STATE_UNKNOWN");
  if (state === "active") {
    if (!metrics.sources.length) reasons.push("NO_SOURCES");
    if (staleSources.length) reasons.push("SOURCE_STALE");
    if (publicationAgeHours === null || publicationAgeHours > maxPublicationAgeHours) reasons.push("PUBLICATION_STALE");
    if (metrics.backlog.oldestAt && ageHours(metrics.backlog.oldestAt) > maxSourceAgeHours) reasons.push("BACKLOG_STALE");
    if (metrics.analysisBacklog?.oldestAt && ageHours(metrics.analysisBacklog.oldestAt) > maxSourceAgeHours) reasons.push("ANALYSIS_BACKLOG_STALE");
    if (metrics.trendSources?.some((item) => ageHours(item.lastFetchedAt) === null || ageHours(item.lastFetchedAt) > maxSourceAgeHours)) reasons.push("TREND_SOURCE_STALE");
  }
  if (metrics.backlog.failed || metrics.failedTasks || metrics.expiredTasks || metrics.waitingTasks) reasons.push("TASKS_REQUIRE_ATTENTION");
  if (failureRate > 0.2) reasons.push("FAILURE_RATE_HIGH");
  if (metrics.notificationFailures) reasons.push("NOTIFICATION_FAILED");
  if (metrics.unknownCostCalls) reasons.push("AI_COST_UNKNOWN");
  if (metrics.aiFailures) reasons.push("AI_TRANSPORT_FAILED");
  return { status: reasons.length ? "WARNING" : state === "paused" ? "PAUSED" : "SUCCEEDED", state, reasons, staleSources, publicationAgeHours, maxSourceAgeHours, maxPublicationAgeHours, failureRate, metrics, sampledAt: now.toISOString() };
}

export async function latestPublication(db) {
  const [result] = await db.$queryRaw`SELECT max(a."analyzedAt") AS "latestPublishedAt" FROM "Event" e CROSS JOIN LATERAL (SELECT * FROM "Analysis" WHERE "eventId" = e.id ORDER BY "analyzedAt" DESC, id DESC LIMIT 1) a WHERE e."isPublic" AND a.status IN ('AUTO_PUBLISHED', 'APPROVED') AND a."inputRevision" = e."materialRevision"`;
  return result.latestPublishedAt;
}

export async function operationalMetrics(db, now = new Date()) {
  const since = new Date(now.getTime() - 86400000);
  const pending = { processingStatus: { in: ["PENDING", "WAITING_TRANSLATION"] } };
  const pendingAnalysis = { analyses: { none: { status: { not: "STALE" } } }, documents: { some: {}, every: { document: { processingStatus: "PROCESSED" } } } };
  const [sources, latestPublishedAt, pendingCount, failed, oldest, attempts, failedAttempts, failedTasks, expiredTasks, waitingTasks, emails, pushes, alerts, calls, recentTasks] = await Promise.all([
    db.source.findMany({ select: { id: true, name: true, lastFetchedAt: true }, orderBy: { id: "asc" } }),
    latestPublication(db), db.rawDocument.count({ where: pending }), db.rawDocument.count({ where: { processingStatus: "FAILED" } }),
    db.rawDocument.aggregate({ where: pending, _min: { fetchedAt: true } }),
    db.pipelineAttempt.count({ where: { startedAt: { gte: since } } }),
    db.pipelineAttempt.count({ where: { startedAt: { gte: since }, status: { in: ["FAILED", "EXPIRED"] } } }),
    db.pipelineTask.count({ where: { status: "FAILED" } }),
    db.pipelineTask.count({ where: { status: "RUNNING", leaseUntil: { lte: now } } }),
    db.pipelineTask.count({ where: { status: "WAITING" } }),
    db.emailDelivery.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
    db.pushDelivery.count({ where: { status: { in: ["FAILED", "EXPIRED"] }, updatedAt: { gte: since } } }),
    db.alertDelivery.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
    db.aiCall.findMany({ where: { createdAt: { gte: since } }, select: { id: true, scope: true, model: true, provider: true, status: true, inputTokens: true, outputTokens: true, costUsd: true, pricingVersion: true, durationMs: true, createdAt: true, attemptId: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.pipelineTask.findMany({ where: { status: { in: ["FAILED", "WAITING", "RUNNING"] } }, select: { id: true, name: true, resourceId: true, revision: true, status: true, attemptCount: true, retryAt: true, leaseUntil: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  const [cost, unknownCostCalls, totalCalls] = await Promise.all([
    db.aiCall.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true } }),
    db.aiCall.count({ where: { createdAt: { gte: since }, costUsd: null } }),
    db.aiCall.count({ where: { createdAt: { gte: since } } }),
  ]);
  const [analysisPending, analysisOldest, trendSubjects, aiFailures] = await Promise.all([
    db.event.count({ where: pendingAnalysis }), db.event.aggregate({ where: pendingAnalysis, _min: { createdAt: true } }),
    db.trendSubject.findMany({ where: { enabled: true }, select: { id: true, name: true, snapshots: { select: { sourceFetchedAt: true }, orderBy: { sourceFetchedAt: "desc" }, take: 1 } } }),
    db.aiCall.count({ where: { createdAt: { gte: since }, status: { not: "HTTP_SUCCEEDED" } } }),
  ]);
  return { sources, latestPublishedAt, backlog: { pending: pendingCount, failed, oldestAt: oldest._min.fetchedAt }, analysisBacklog: { pending: analysisPending, oldestAt: analysisOldest._min.createdAt }, trendSources: trendSubjects.map((item) => ({ id: item.id, name: item.name, lastFetchedAt: item.snapshots[0]?.sourceFetchedAt ?? null })), attempts, failedAttempts, failedTasks, expiredTasks, waitingTasks, notificationFailures: emails + pushes + alerts, notifications: { emails, pushes, alerts }, knownCostUsd: cost._sum.costUsd, unknownCostCalls, totalCalls, aiFailures, recentCalls: calls, recentTasks };
}
