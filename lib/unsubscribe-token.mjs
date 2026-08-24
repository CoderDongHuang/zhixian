import { createHmac, timingSafeEqual } from "node:crypto";

export const UNSUBSCRIBE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function signingSecrets() {
  const current = process.env.UNSUBSCRIBE_TOKEN_SECRET || process.env.AUTH_SECRET;
  const previous = process.env.UNSUBSCRIBE_TOKEN_PREVIOUS_SECRET;
  if (!current || current.length < 24) throw new Error("UNSUBSCRIBE_TOKEN_SECRET or AUTH_SECRET must contain at least 24 characters");
  return [current, previous].filter((value) => value && value.length >= 24);
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(`unsubscribe:${payload}`).digest("base64url");
}

export function issueUnsubscribeToken(userId, now = Date.now(), ttlMs = UNSUBSCRIBE_TOKEN_TTL_MS) {
  if (!userId || ttlMs <= 0) throw new Error("A user and positive token lifetime are required");
  const claims = { v: 1, purpose: "unsubscribe", sub: userId, iat: Math.floor(now / 1000), exp: Math.floor((now + ttlMs) / 1000) };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, signingSecrets()[0])}`;
}

export function verifyUnsubscribeToken(token, expectedUserId, now = Date.now()) {
  const [payload, supplied, extra] = String(token || "").split(".");
  if (!payload || !supplied || extra || !expectedUserId) return null;
  let signatureValid = false;
  for (const secret of signingSecrets()) {
    const expected = Buffer.from(signature(payload, secret));
    const actual = Buffer.from(supplied);
    signatureValid ||= actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  if (!signatureValid) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const nowSeconds = Math.floor(now / 1000);
    return claims.v === 1 && claims.purpose === "unsubscribe" && claims.sub === expectedUserId && claims.iat <= nowSeconds + 300 && claims.exp > nowSeconds ? claims : null;
  } catch {
    return null;
  }
}
