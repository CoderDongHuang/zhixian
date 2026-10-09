import { parseAuthInput } from "@/lib/auth-input";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRefreshToken, miniRefreshExpiry, refreshTokenHash, tokenResponse } from "@/lib/mini-auth";
import { isSessionDeviceAllowed } from "@/lib/sync-policy";

export async function POST(request: Request) {
  const body = await parseAuthInput(request, "refresh");
  if (!body) return NextResponse.json({ error: "认证请求格式无效" }, { status: 400 });
  const currentToken = typeof body?.refreshToken === "string" ? body.refreshToken : "";
  const deviceId = body.deviceId;
  if (!currentToken || !deviceId) return NextResponse.json({ error: "refreshToken and deviceId are required" }, { status: 400 });
  const session = await prisma.miniSession.findUnique({ where: { refreshTokenHash: refreshTokenHash(currentToken) }, include: { user: { select: { email: true } } } });
  if (!isSessionDeviceAllowed(session, deviceId)) return NextResponse.json({ error: "invalid refresh token" }, { status: 401 });
  const nextToken = createRefreshToken();
  const updated = await prisma.miniSession.updateMany({ where: { id: session.id, refreshTokenHash: refreshTokenHash(currentToken), revokedAt: null }, data: { refreshTokenHash: refreshTokenHash(nextToken), expiresAt: miniRefreshExpiry() } });
  if (updated.count !== 1) return NextResponse.json({ error: "refresh token already used" }, { status: 401 });
  return NextResponse.json({ ...tokenResponse(session.userId, session.id, nextToken), account: { linked: Boolean(session.user.email), email: session.user.email } });
}
