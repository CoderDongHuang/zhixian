import { NextResponse } from "next/server";
import { hashSecret, isValidEmail, normalizeEmail } from "@/lib/auth";
import { createRefreshToken, miniRefreshExpiry, refreshTokenHash, tokenResponse } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email || "");
  const code = String(body?.code || "").trim();
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().slice(0, 128) : "";
  if (!isValidEmail(email) || !/^\d{6}$/.test(code) || !deviceId) return NextResponse.json({ error: "invalid credentials" }, { status: 400 });

  const now = new Date();
  const [user, otp] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }),
    prisma.emailOtp.findFirst({ where: { email, codeHash: hashSecret(code), usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!user || !otp) return NextResponse.json({ error: "验证码无效或已过期" }, { status: 401 });

  const refreshToken = createRefreshToken();
  const session = await prisma.$transaction(async (tx) => {
    await tx.emailOtp.update({ where: { id: otp.id }, data: { usedAt: now } });
    return tx.miniSession.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      update: { refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry(), revokedAt: null },
      create: { userId: user.id, deviceId, refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry() },
    });
  });
  return NextResponse.json({ ...tokenResponse(user.id, session.id, refreshToken), account: { linked: true, email: user.email } });
}
