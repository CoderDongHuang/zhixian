import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { enforceAuthLimits, otpVerifyRules, verifyLatestOtp } from "@/lib/auth-security";
import { createRefreshToken, miniRefreshExpiry, refreshTokenHash, tokenResponse } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email || "");
  const code = String(body?.code || "").trim();
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().slice(0, 128) : "";
  if (!isValidEmail(email) || !/^\d{6}$/.test(code) || !deviceId) return NextResponse.json({ error: "invalid credentials" }, { status: 400 });

  const now = new Date();
  const e2eMode = process.env.VERCEL_ENV !== "production" && process.env.E2E_TEST_MODE === "true";
  if (!e2eMode && await enforceAuthLimits(otpVerifyRules(request, email, deviceId))) return NextResponse.json({ error: "验证失败，请稍后再试" }, { status: 429 });
  const [user, otp] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }),
    verifyLatestOtp(email, code, now),
  ]);
  if (!user || !otp) return NextResponse.json({ error: "验证码无效或已过期" }, { status: 401 });

  const refreshToken = createRefreshToken();
  const session = await prisma.$transaction(async (tx) => {
    const consumed = await tx.emailOtp.updateMany({ where: { id: otp.id, usedAt: null, lockedAt: null }, data: { usedAt: now } });
    if (consumed.count !== 1) throw new Error("OTP was already consumed");
    return tx.miniSession.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      update: { refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry(), revokedAt: null },
      create: { userId: user.id, deviceId, refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry() },
    });
  });
  return NextResponse.json({ ...tokenResponse(user.id, session.id, refreshToken), account: { linked: true, email: user.email } });
}
