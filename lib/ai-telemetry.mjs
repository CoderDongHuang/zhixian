import { currentPipelineTask } from "./pipeline-tasks.mjs";
import { budgetPolicy, boundedAiRequest, reserveAiBudget, settleAiBudget } from "./ai-budget.mjs";

const tokenCount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
export function modelPrice(model, provider, env = process.env) {
  let price;
  try { price = JSON.parse(env.AI_PRICING_JSON || "{}")[`${provider}/${model}`]; } catch { return null; }
  return typeof price?.version === "string" && price.version.trim() && price.version.length <= 100 && [price.inputPerMillion, price.outputPerMillion].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) ? price : null;
}
export function usageCost(usage, model, provider, env = process.env) {
  const inputTokens = tokenCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const outputTokens = tokenCount(usage?.completion_tokens ?? usage?.output_tokens);
  const price = modelPrice(model, provider, env);
  const validPrice = price !== null;
  const calculated = validPrice && inputTokens !== null && outputTokens !== null ? (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1000000 : null;
  const costUsd = Number.isFinite(calculated) ? calculated : null;
  return { inputTokens, outputTokens, costUsd, pricingVersion: costUsd !== null ? String(price.version) : null };
}

export function trackedAiFetch(db, scope, model, fetchImpl = fetch, env = process.env) {
  return async (url, init) => {
    const started = performance.now();
    const provider = new URL(String(url)).host;
    const policy = budgetPolicy(env);
    if (policy && !modelPrice(model, provider, env)) throw new Error("AI_BUDGET_PRICE_REQUIRED");
    const request = boundedAiRequest(init, model, policy);
    const reservation = await reserveAiBudget(db, policy, { scope, model, provider });
    let response, payload, status = "NETWORK_FAILED";
    try {
      response = await fetchImpl(url, request);
      status = response.ok ? "HTTP_SUCCEEDED" : "HTTP_FAILED";
      try { payload = await response.clone().json(); } catch { if (response.ok) status = "INVALID_RESPONSE"; }
      return response;
    } finally {
      const data = {
        attemptId: currentPipelineTask()?.attemptId ?? null, scope, model, provider, status,
        httpStatus: response?.status ?? null, ...usageCost(payload?.data?.[0]?.embedding ? { ...payload.usage, input_tokens: payload.usage?.prompt_tokens ?? payload.usage?.total_tokens, output_tokens: 0 } : payload?.usage, model, provider, env),
        durationMs: Math.min(2147483647, Math.round(performance.now() - started)),
      };
      if (reservation) {
        await db.$transaction(async (tx) => {
          const call = await tx.aiCall.create({ data });
          await settleAiBudget(tx, reservation, call);
        });
      } else await db.aiCall.create({ data });
    }
  };
}
