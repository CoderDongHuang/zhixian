import { createHmac, timingSafeEqual } from "node:crypto";

const ACCESS_TTL_SECONDS = 15 * 60;
type AccessClaims = { v: 1; sub: string; sid: string; exp: number };
type CodeSession = { openid?: string; unionid?: string; session_key?: string; errcode?: number; errmsg?: string };

function signingKey() {
  const value = process.env.MINI_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!value || value.length < 24) throw new Error("MINI_TOKEN_SECRET or AUTH_SECRET must contain at least 24 characters");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function issueAccessToken(userId: string, sessionId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ v: 1, sub: userId, sid: sessionId, exp: Math.floor(now / 1000) + ACCESS_TTL_SECONDS } satisfies AccessClaims)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyAccessToken(token: string, now = Date.now()): AccessClaims | null {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) return null;
  const left = Buffer.from(supplied);
  const right = Buffer.from(signature(payload));
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AccessClaims;
    return claims.v === 1 && claims.exp > Math.floor(now / 1000) && Boolean(claims.sub) && Boolean(claims.sid) ? claims : null;
  } catch { return null; }
}

export async function exchangeWechatCode(code: string, fetchImpl: typeof fetch = fetch): Promise<{ openId: string; unionId: string | null }> {
  const appId = process.env.WECHAT_APP_ID;
  const secret = process.env.WECHAT_APP_SECRET;
  if (!appId || !secret) throw new Error("WeChat credentials are not configured");
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  const data = await response.json() as CodeSession;
  if (!response.ok || data.errcode || !data.openid || !data.session_key) throw new Error(`WeChat code2Session failed (${data.errcode ?? response.status})`);
  return { openId: data.openid, unionId: data.unionid || null };
}

export const accessTokenTtlSeconds = ACCESS_TTL_SECONDS;
