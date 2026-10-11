// Persistent admission ledger. USD values use integer millionths, never float sums.
export class AiBudgetError extends Error {
  constructor(code) { super(code); this.name = "AiBudgetError"; }
}
const fail = (code) => { throw new AiBudgetError(code); };
export function usdMicros(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/.test(value)) fail("AI_BUDGET_INVALID_MONEY");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}
export function budgetPolicy(env = process.env) {
  const raw = env.AI_BUDGET_JSON?.trim();
  if (![undefined, "", "false", "true"].includes(env.AI_BUDGET_ENFORCE)) fail("AI_BUDGET_INVALID_CONFIG");
  if (!raw) {
    if (env.AI_BUDGET_ENFORCE === "true") fail("AI_BUDGET_CONFIG_REQUIRED");
    return null;
  }
  let policy;
  try { policy = JSON.parse(raw); } catch { fail("AI_BUDGET_INVALID_CONFIG"); }
  const keys = ["dailyLimitUsd", "reservationUsd", "maxCallsPerDay", "maxInputBytes", "maxOutputTokens"];
  if (!policy || typeof policy !== "object" || Array.isArray(policy) || keys.some((key) => !(key in policy)) || Object.keys(policy).some((key) => !keys.includes(key))) fail("AI_BUDGET_INVALID_CONFIG");
  const dailyLimitMicros = usdMicros(policy.dailyLimitUsd), reservationMicros = usdMicros(policy.reservationUsd);
  if (reservationMicros <= 0n || dailyLimitMicros < reservationMicros) fail("AI_BUDGET_INVALID_CONFIG");
  for (const [key, maximum] of [["maxCallsPerDay", 1000000], ["maxInputBytes", 1000000], ["maxOutputTokens", 100000]]) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0 || policy[key] > maximum) fail("AI_BUDGET_INVALID_CONFIG");
  }
  return { ...policy, dailyLimitMicros, reservationMicros };
}

export function boundedAiRequest(init, model, policy) {
  if (!policy) return init;
  if (init?.method?.toUpperCase() !== "POST" || typeof init.body !== "string" || Buffer.byteLength(init.body, "utf8") > policy.maxInputBytes) fail("AI_BUDGET_INVALID_REQUEST");
  let body;
  try { body = JSON.parse(init.body); } catch { fail("AI_BUDGET_INVALID_REQUEST"); }
  if (!body || typeof body !== "object" || Array.isArray(body) || body.model !== model || body.stream || (body.n !== undefined && body.n !== 1)) fail("AI_BUDGET_INVALID_REQUEST");
  if (body.input === undefined) {
    if (!Array.isArray(body.messages) || !body.messages.length) fail("AI_BUDGET_INVALID_REQUEST");
    for (const field of ["max_tokens", "max_completion_tokens"]) {
      if (body[field] !== undefined && (!Number.isSafeInteger(body[field]) || body[field] <= 0 || body[field] > policy.maxOutputTokens)) fail("AI_BUDGET_OUTPUT_LIMIT");
    }
    if (body.max_tokens === undefined && body.max_completion_tokens === undefined) body.max_tokens = policy.maxOutputTokens;
  } else if (body.messages !== undefined || !(typeof body.input === "string" && body.input.length || Array.isArray(body.input) && body.input.length && body.input.every((item) => typeof item === "string" && item.length))) fail("AI_BUDGET_INVALID_REQUEST");
  return { ...init, body: JSON.stringify(body), redirect: "error" };
}

export async function reserveAiBudget(db, policy, { scope, model, provider }) {
  if (!policy) return null;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('zhixian-ai-budget-global'))`;
    const [clock] = await tx.$queryRaw`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, clock_timestamp() AS now`;
    const day = clock.day;
    await tx.aiBudgetDay.upsert({ where: { day }, create: { day }, update: {} });
    const [totals, uncertain] = await Promise.all([
      tx.aiBudgetReservation.aggregate({ where: { day }, _sum: { chargedMicros: true }, _count: true }),
      tx.aiBudgetReservation.count({ where: { OR: [{ status: { in: ["UNCERTAIN", "OVER_LIMIT"] } }, { status: "RESERVED", createdAt: { lt: new Date(clock.now.getTime() - 300000) } }] } }),
    ]);
    if (uncertain) fail("AI_BUDGET_UNCERTAIN");
    if (totals._count >= policy.maxCallsPerDay) fail("AI_BUDGET_CALL_LIMIT");
    if ((totals._sum.chargedMicros ?? 0n) + policy.reservationMicros > policy.dailyLimitMicros) fail("AI_BUDGET_EXHAUSTED");
    return tx.aiBudgetReservation.create({ data: { day, scope, model, provider, reservedMicros: policy.reservationMicros, chargedMicros: policy.reservationMicros, status: "RESERVED" } });
  }, { maxWait: 15000, timeout: 15000 });
}

export async function settleAiBudget(tx, reservation, call) {
  if (!reservation) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('zhixian-ai-budget-global'))`;
  const known = typeof call.costUsd === "number" && Number.isFinite(call.costUsd) && call.costUsd >= 0 && call.pricingVersion;
  const scaled = known ? Math.ceil(call.costUsd * 1000000) : null;
  const micros = Number.isSafeInteger(scaled) ? BigInt(scaled) : reservation.reservedMicros;
  const status = !Number.isSafeInteger(scaled) ? "UNCERTAIN" : micros > reservation.reservedMicros ? "OVER_LIMIT" : "SETTLED";
  await tx.aiBudgetReservation.update({ where: { id: reservation.id }, data: { callId: call.id, status, chargedMicros: micros, settledAt: new Date() } });
}

export async function aiBudgetMetrics(db, env = process.env) {
  let policy;
  try { policy = budgetPolicy(env); } catch { return { state: "INVALID_CONFIG" }; }
  if (!policy) return { state: "DISABLED" };
  const [clock] = await db.$queryRaw`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, clock_timestamp() AS now`;
  const rows = await db.aiBudgetReservation.findMany({ where: { day: clock.day }, select: { status: true, chargedMicros: true, createdAt: true } });
  const unresolved = await db.aiBudgetReservation.count({ where: { OR: [{ status: { in: ["UNCERTAIN", "OVER_LIMIT"] } }, { status: "RESERVED", createdAt: { lt: new Date(clock.now.getTime() - 300000) } }] } });
  const charged = rows.reduce((sum, row) => sum + row.chargedMicros, 0n);
  const uncertain = rows.filter((row) => ["UNCERTAIN", "OVER_LIMIT"].includes(row.status)).length;
  const pending = rows.filter((row) => row.status === "RESERVED");
  const stale = pending.filter((row) => clock.now.getTime() - row.createdAt.getTime() > 300000).length;
  const state = unresolved ? "UNCERTAIN" : charged + policy.reservationMicros > policy.dailyLimitMicros || rows.length >= policy.maxCallsPerDay ? "EXHAUSTED" : "AVAILABLE";
  return { state, day: clock.day, dailyLimitUsd: policy.dailyLimitUsd, reservationUsd: policy.reservationUsd, chargedUsd: Number(charged) / 1000000, calls: rows.length, maxCallsPerDay: policy.maxCallsPerDay, uncertain, unresolved, pending: pending.length, stale };
}
