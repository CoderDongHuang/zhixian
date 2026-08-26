export const RETENTION_DAYS = Object.freeze({
  emailOtp: 7,
  miniSession: 30,
  authThrottle: 7,
  syncChange: 90,
  syncRequest: 7,
  behaviorEvent: 180,
  reportExport: 90,
  pushDelivery: 90,
  alertDelivery: 180,
  emailDelivery: 365,
  pipelineRun: 90,
  securityEvent: 365,
  sourceSnapshot: 365,
  trendSnapshot: 730,
  trendForecast: 365,
  researchAgentTask: 365,
});

export function retentionCutoff(days, now = Date.now()) {
  if (!Number.isFinite(days) || days <= 0) throw new Error("Retention days must be positive");
  return new Date(now - days * 86_400_000);
}
