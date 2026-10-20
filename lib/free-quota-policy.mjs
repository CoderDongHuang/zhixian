export const freeQuotaModels = ["qwen3.8-flash", "qwen3.8-27b"];
export const freeQuotaSourceTypes = ["OFFICIAL_BLOG", "GITHUB_API", "PAPER", "HACKER_NEWS", "STACK_OVERFLOW"];
export const freeQuotaEndpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

export function localFreeAiEnv(env, now = new Date()) {
  if (env.LOCAL_FREE_AI_ENABLED !== "true") return null;
  const expires = Date.parse(env.LOCAL_FREE_AI_EXPIRES_AT ?? "");
  if (env.LOCAL_FREE_AI_STOP_CONFIRMED !== "true" || !Number.isFinite(expires) || expires <= now.getTime()) throw new Error("FREE_QUOTA_CONFIRMATION_REQUIRED_OR_EXPIRED");
  if (env.ANALYSIS_AI_API_URL !== freeQuotaEndpoint || !env.ANALYSIS_AI_API_KEY) throw new Error("FREE_QUOTA_DASHSCOPE_CONFIGURATION_REQUIRED");
  return {
    ...env,
    AI_API_KEY: env.ANALYSIS_AI_API_KEY, AI_API_URL: freeQuotaEndpoint, AI_MODEL: freeQuotaModels[0],
    ANALYSIS_AI_MODEL: freeQuotaModels[1],
    PROCESS_BATCH_SIZE: "10", PROCESS_NEWEST_FIRST: "true", ANALYSIS_BATCH_SIZE: "3",
    PIPELINE_REPLAY_TASK: "",
  };
}

export async function assertFreeQuotaRequest(db, env, url, model, now = new Date()) {
  if (env.LOCAL_FREE_AI_ENABLED !== "true") return;
  localFreeAiEnv(env, now);
  if (String(url) !== freeQuotaEndpoint || !freeQuotaModels.includes(model)) throw new Error("FREE_QUOTA_PROVIDER_NOT_ALLOWED");
  // Shanghai calendar day. Failed attempts also count toward the daily ceiling.
  const midnight = new Date(`${new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)}T00:00:00+08:00`);
  const calls = await db.aiCall.count({ where: { provider: "dashscope.aliyuncs.com", model: { in: freeQuotaModels }, createdAt: { gte: midnight } } });
  if (calls >= 60) throw new Error("FREE_QUOTA_DAILY_LIMIT");
}

export function providerOptions(url, json = false) {
  return new URL(url).hostname === "dashscope.aliyuncs.com" ? { enable_thinking: false, ...(json ? { response_format: { type: "json_object" } } : {}) } : {};
}

export function modelHttpError(status, payload) {
  const code = payload?.error?.code ?? payload?.code;
  return new Error(code === "AllocationQuota.FreeTierOnly" ? "FREE_QUOTA_EXHAUSTED" : `Model returned HTTP ${status}`);
}

export const isFreeQuotaStop = error => /FREE_QUOTA_/.test(error?.message ?? "");
