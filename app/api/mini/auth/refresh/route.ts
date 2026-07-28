import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRefreshToken, miniRefreshExpiry, refreshTokenHash, tokenResponse } from "@/lib/mini-auth";
import { isSessionDeviceAllowed } from "@/lib/sync-policy";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const currentToken = typeof body?.refreshToken === "string" ? body.refreshToken : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().slice(0, 128) : "";
  if (!currentToken || !deviceId) return NextResponse.json({ error: "refreshToken and deviceId are required" }, { status: 400 });
  const session = await prisma.miniSession.findUnique({ where: { refreshTokenHash: refreshTokenHash(currentToken) } });
  if (!isSessionDeviceAllowed(session, deviceId)) return NextResponse.json({ error: "invalid refresh token" }, { status: 401 });
  const nextToken = createRefreshToken();
  const updated = await prisma.miniSession.updateMany({ where: { id: session.id, refreshTokenHash: refreshTokenHash(currentToken), revokedAt: null }, data: { refreshTokenHash: refreshTokenHash(nextToken), expiresAt: miniRefreshExpiry() } });
  if (updated.count !== 1) return NextResponse.json({ error: "refresh token already used" }, { status: 401 });
  return NextResponse.json(tokenResponse(session.userId, session.id, nextToken));
}
