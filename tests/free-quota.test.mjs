import assert from "node:assert/strict";
import test from "node:test";
import { assertFreeQuotaRequest, freeQuotaEndpoint, localFreeAiEnv, modelHttpError, providerOptions } from "../lib/free-quota-policy.mjs";

const now = new Date("2026-10-20T12:00:00+08:00");
const env = { LOCAL_FREE_AI_ENABLED: "true", LOCAL_FREE_AI_STOP_CONFIRMED: "true", LOCAL_FREE_AI_EXPIRES_AT: "2026-11-17T00:00:00+08:00", ANALYSIS_AI_API_KEY: "test-only", ANALYSIS_AI_API_URL: freeQuotaEndpoint, AI_API_KEY: "paid-key", AI_API_URL: "https://api.deepseek.com", AI_MODEL: "paid-model" };

test("local free analysis uses only confirmed DashScope models and expires closed", () => {
  assert.equal(localFreeAiEnv({}, now), null);
  const config = localFreeAiEnv(env, now);
  assert.equal(config.AI_API_KEY, "test-only");
  assert.equal(config.AI_API_URL, freeQuotaEndpoint);
  assert.equal(config.AI_MODEL, "qwen3.8-flash");
  assert.equal(config.ANALYSIS_AI_MODEL, "qwen3.8-27b");
  for (const change of [{ LOCAL_FREE_AI_STOP_CONFIRMED: "false" }, { LOCAL_FREE_AI_EXPIRES_AT: "" }, { LOCAL_FREE_AI_EXPIRES_AT: now.toISOString() }, { ANALYSIS_AI_API_URL: "https://other.example" }, { ANALYSIS_AI_API_KEY: "" }]) assert.throws(() => localFreeAiEnv({ ...env, ...change }, now), /FREE_QUOTA_/);
});

test("daily limit includes failed calls and uses Shanghai midnight; no paid provider fallback", async () => {
  let query;
  const db = { aiCall: { count: async args => { query = args; return 59; } } };
  await assertFreeQuotaRequest(db, env, freeQuotaEndpoint, "qwen3.8-flash", now);
  assert.equal(query.where.createdAt.gte.toISOString(), "2026-10-19T16:00:00.000Z");
  assert.equal(query.where.status, undefined);
  await assert.rejects(assertFreeQuotaRequest(db, env, "https://api.deepseek.com", "qwen3.8-flash", now), /PROVIDER_NOT_ALLOWED/);
  await assert.rejects(assertFreeQuotaRequest(db, env, freeQuotaEndpoint, "qwen-plus", now), /PROVIDER_NOT_ALLOWED/);
  db.aiCall.count = async () => 60;
  await assert.rejects(assertFreeQuotaRequest(db, env, freeQuotaEndpoint, "qwen3.8-27b", now), /DAILY_LIMIT/);
});

test("DashScope JSON requests disable thinking and quota exhaustion is recognizable without provider error text", () => {
  assert.deepEqual(providerOptions(freeQuotaEndpoint, true), { enable_thinking: false, response_format: { type: "json_object" } });
  assert.deepEqual(providerOptions("https://api.deepseek.com"), {});
  assert.equal(modelHttpError(403, { error: { code: "AllocationQuota.FreeTierOnly", message: "secret" } }).message, "FREE_QUOTA_EXHAUSTED");
  assert.equal(modelHttpError(401, { error: { message: "secret" } }).message, "Model returned HTTP 401");
});
