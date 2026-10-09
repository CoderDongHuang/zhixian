import { normalizeEvidenceCandidates } from "../lib/evidence-policy.mjs";

const trustedSingleSourceTypes = new Set(["OFFICIAL_BLOG", "GITHUB_API"]);

export function analysisConfidence(documents, verification) {
  const score = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const trust = documents.reduce((sum, { document }) => sum + score(document.source.trustScore), 0) / Math.max(documents.length, 1);
  return score(verification.factuality) * 0.5 + score(verification.relevance) * 0.15 + score(verification.completeness) * 0.15 + trust * 0.2;
}

export function confidenceCap(documents) {
  const sourceIds = new Set(documents.map(({ document }) => document.sourceId));
  if (sourceIds.size >= 2) return { cap: 1, reason: "multiple-sources" };
  const source = documents[0]?.document?.source;
  if (source && trustedSingleSourceTypes.has(source.type) && source.trustScore >= 0.85) {
    return { cap: 0.9, reason: `trusted-single-source:${source.type}` };
  }
  return { cap: 0.74, reason: "unverified-single-source" };
}

export function publicationDecision(documents, calculatedConfidence, unsupportedClaims = [], candidates = []) {
  const policy = confidenceCap(documents);
  const confidence = Math.max(0, Math.min(policy.cap, Number(calculatedConfidence) || 0));
  const evidence = normalizeEvidenceCandidates(candidates);
  const located = evidence.length > 0 && evidence.every((item) => documents.some(({ document }) => (document.cleanedContent || document.content || "").slice(0, 9000).includes(item.quote)));
  const support = evidence.some((item) => item.stance === "SUPPORT");
  const conflict = evidence.some((item) => item.stance === "CONFLICT");
  return {
    confidence,
    publish: confidence >= 0.78 && unsupportedClaims.length === 0 && located && support && !conflict,
    reason: !located || !support ? "missing-located-support" : conflict ? "conflicting-evidence" : policy.reason,
  };
}
