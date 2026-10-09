import { currentPipelineTask } from "./pipeline-tasks.mjs";

const tokenCount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
export function usageCost(usage, model, provider, env = process.env) {
  const inputTokens = tokenCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const outputTokens = tokenCount(usage?.completion_tokens ?? usage?.output_tokens);
  let price;
  try { price = JSON.parse(env.AI_PRICING_JSON || "{}")[`${provider}/${model}`]; } catch { /* Unknown prices must not become zero. */ }
  const validPrice = price?.version && [price.inputPerMillion, price.outputPerMillion].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
  const calculated = validPrice && inputTokens !== null && outputTokens !== null ? (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1000000 : null;
  const costUsd = Number.isFinite(calculated) ? calculated : null;
  return { inputTokens, outputTokens, costUsd, pricingVersion: costUsd !== null ? String(price.version) : null };
}

export function trackedAiFetch(db, scope, model, fetchImpl = fetch, env = process.env) {
  return async (url, init) => {
    const started = performance.now();
    const provider = new URL(String(url)).host;
    let response, payload, status = "NETWORK_FAILED";
    try {
      response = await fetchImpl(url, init);
      status = response.ok ? "HTTP_SUCCEEDED" : "HTTP_FAILED";
      try { payload = await response.clone().json(); } catch { if (response.ok) status = "INVALID_RESPONSE"; }
      return response;
    } finally {
      await db.aiCall.create({ data: {
        attemptId: currentPipelineTask()?.attemptId ?? null, scope, model, provider, status,
        httpStatus: response?.status ?? null, ...usageCost(payload?.data?.[0]?.embedding ? { ...payload.usage, input_tokens: payload.usage?.prompt_tokens ?? payload.usage?.total_tokens, output_tokens: 0 } : payload?.usage, model, provider, env),
        durationMs: Math.min(2147483647, Math.round(performance.now() - started)),
      } });
    }
  };
}
