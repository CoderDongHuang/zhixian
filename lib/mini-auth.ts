import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashSecret } from "@/lib/auth";

import { accessTokenTtlSeconds, issueAccessToken, verifyAccessToken } from "@/lib/mini-security";
export { exchangeWechatCode, issueAccessToken, verifyAccessToken } from "@/lib/mini-security";

const REFRESH_TTL_DAYS = 30;

export function createRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export async function authenticateMiniRequest(request: Request) {
  const header = request.headers.get("authorization") || "";
  const claims = verifyAccessToken(header.startsWith("Bearer ") ? header.slice(7) : "");
  if (!claims) return null;
  const session = await prisma.miniSession.findFirst({ where: { id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
  return session ? { user: session.user, session } : null;
}

export function tokenResponse(userId: string, sessionId: string, refreshToken: string) {
  return { accessToken: issueAccessToken(userId, sessionId), refreshToken, expiresIn: accessTokenTtlSeconds, tokenType: "Bearer" };
}

export const miniRefreshExpiry = () => new Date(Date.now() + REFRESH_TTL_DAYS * 86400000);
export const refreshTokenHash = (token: string) => hashSecret(`mini-refresh:${token}`);
