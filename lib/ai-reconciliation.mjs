import { usdMicros } from "./ai-budget.mjs";

const invalid = () => { throw new Error("AI_BILL_INVALID_FORMAT"); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const safeRequestId = (value) => typeof value === "string" && /^[a-zA-Z0-9._:-]{1,200}$/.test(value) ? value : null;
const utc = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z")) invalid();
  return date;
};
export function parseAiBill(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 5 * 1024 * 1024) invalid();
  let bill;
  try { bill = JSON.parse(text); } catch { invalid(); }
  if (!exactKeys(bill, ["version", "currency", "provider", "periodStart", "periodEnd", "entries"]) || bill.version !== 1 || bill.currency !== "USD") invalid();
  if (typeof bill.provider !== "string" || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(bill.provider) || bill.provider.length > 253) invalid();
  try { if (new URL(`https://${bill.provider}`).host !== bill.provider) invalid(); } catch { invalid(); }
  const start = utc(bill.periodStart), end = utc(bill.periodEnd);
  if (end <= start || end - start > 366 * 86400000 || !Array.isArray(bill.entries) || bill.entries.length > 50000) invalid();
  const entries = bill.entries.map((row) => {
    if (!exactKeys(row, ["requestId", "model", "billedUsd"]) || !safeRequestId(row.requestId) || typeof row.model !== "string" || !row.model.trim() || row.model.length > 200) invalid();
    return { ...row, billedMicros: usdMicros(row.billedUsd) };
  });
  return { ...bill, start, end, entries };
}

export const microsUsd = (value) => `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 1000000n}.${((value < 0n ? -value : value) % 1000000n).toString().padStart(6, "0")}`;
const estimateMicros = (call) => typeof call.pricingVersion === "string" && call.pricingVersion.trim() && typeof call.costUsd === "number" && call.costUsd >= 0 && Number.isSafeInteger(Math.round(call.costUsd * 1000000)) ? BigInt(Math.round(call.costUsd * 1000000)) : null;
const groups = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
};

export function reconcileAiBill(bill, calls) {
  // Caller must not pass truncated queries. No fuzzy timestamp/model matching.
  if (!Array.isArray(calls) || calls.length > 100000 || calls.some((call) => call.provider !== bill.provider || !(call.createdAt >= bill.start && call.createdAt < bill.end))) throw new Error("AI_BILL_INVALID_LOCAL_RANGE");
  const local = groups(calls, (call) => safeRequestId(call.providerRequestId));
  const billed = groups(bill.entries, (row) => row.requestId);
  const counts = { localCalls: calls.length, billEntries: bill.entries.length, matched: 0, differences: 0, modelConflicts: 0, unknownCosts: 0, transportFailures: 0, missingRequestIds: 0, duplicateLocalIds: 0, duplicateBillIds: 0, unmatchedLocal: 0, unmatchedBill: 0 };
  let knownEstimated = 0n, billedTotal = 0n, comparableEstimated = 0n, comparableBilled = 0n;
  for (const list of local.values()) if (list.length > 1) counts.duplicateLocalIds++;
  for (const list of billed.values()) if (list.length > 1) counts.duplicateBillIds++;
  for (const call of calls) {
    const cost = estimateMicros(call);
    if (cost === null) counts.unknownCosts++; else knownEstimated += cost;
    if (call.status !== "HTTP_SUCCEEDED") counts.transportFailures++;
    const id = safeRequestId(call.providerRequestId);
    if (!id) counts.missingRequestIds++;
    if (!id || !billed.has(id)) counts.unmatchedLocal++;
  }
  for (const row of bill.entries) {
    billedTotal += row.billedMicros;
    const candidates = local.get(row.requestId);
    if (!candidates) { counts.unmatchedBill++; continue; }
    if (candidates.length !== 1 || billed.get(row.requestId).length !== 1) continue;
    const call = candidates[0];
    if (call.model !== row.model) { counts.modelConflicts++; continue; }
    counts.matched++;
    const cost = estimateMicros(call);
    if (cost !== null) {
      comparableEstimated += cost; comparableBilled += row.billedMicros;
      if (cost !== row.billedMicros) counts.differences++;
    }
  }
  const review = Object.entries(counts).some(([key, value]) => !["localCalls", "billEntries", "matched"].includes(key) && value > 0);
  return {
    status: review ? "REVIEW_REQUIRED" : "MATCHED", counts,
    periodStart: bill.start.toISOString(), periodEnd: bill.end.toISOString(), currency: "USD",
    knownEstimatedUsd: microsUsd(knownEstimated), billedUsd: microsUsd(billedTotal),
    comparableEstimatedUsd: microsUsd(comparableEstimated), comparableBilledUsd: microsUsd(comparableBilled), comparableDeltaUsd: microsUsd(comparableBilled - comparableEstimated),
  };
}
