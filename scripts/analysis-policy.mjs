const trustedSingleSourceTypes = new Set(["OFFICIAL_BLOG", "GITHUB_API"]);

export function confidenceCap(documents) {
  const sourceIds = new Set(documents.map(({ document }) => document.sourceId));
  if (sourceIds.size >= 2) return { cap: 1, reason: "multiple-sources" };
  const source = documents[0]?.document?.source;
  if (source && trustedSingleSourceTypes.has(source.type) && source.trustScore >= 0.85) {
    return { cap: 0.9, reason: `trusted-single-source:${source.type}` };
  }
  return { cap: 0.74, reason: "unverified-single-source" };
}

export function publicationDecision(documents, calculatedConfidence, unsupportedClaims = []) {
  const policy = confidenceCap(documents);
  const confidence = Math.max(0, Math.min(policy.cap, Number(calculatedConfidence) || 0));
  return {
    confidence,
    publish: confidence >= 0.78 && unsupportedClaims.length === 0,
    reason: policy.reason,
  };
}
