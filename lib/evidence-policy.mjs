const stances = new Set(["SUPPORT", "CONFLICT", "CONTEXT"]);

export function normalizeEvidenceCandidates(value, legacyQuotes = []) {
  const candidates = Array.isArray(value) && value.length ? value : legacyQuotes;
  const unique = new Map();
  for (const candidate of candidates) {
    const quote = String(typeof candidate === "object" && candidate ? candidate.quote ?? "" : candidate).trim().slice(0, 2000);
    if (!quote) continue;
    const requestedStance = typeof candidate === "object" && candidate ? String(candidate.stance ?? "").toUpperCase() : "SUPPORT";
    const stance = stances.has(requestedStance) ? requestedStance : "CONTEXT";
    unique.set(`${stance}:${quote}`, { quote, stance });
    if (unique.size === 8) break;
  }
  return [...unique.values()];
}
