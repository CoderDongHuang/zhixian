import { parseAuthInput } from "@/lib/auth-input";
import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { enforceAuthLimits, otpVerifyRules, verifyLatestOtp } from "@/lib/auth-security";
import { createRefreshToken, miniRefreshExpiry, refreshTokenHash, tokenResponse } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";
import { consumeOtp, InvalidAuthClaim } from "@/lib/auth-claim";

export async function POST(request: Request) {
  const body = await parseAuthInput(request, "nativeVerify");
  if (!body) return NextResponse.json({ error: "认证请求格式无效" }, { status: 400 });
  const email = normalizeEmail(body?.email || "");
  const code = String(body?.code || "").trim();
  const deviceId = body.deviceId;
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
  let session;
  try {
    session = await prisma.$transaction(async (tx) => {
    await consumeOtp(tx, otp.id);
    return tx.miniSession.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      update: { refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry(), revokedAt: null },
      create: { userId: user.id, deviceId, refreshTokenHash: refreshTokenHash(refreshToken), expiresAt: miniRefreshExpiry() },
    });
    });
  } catch (error) {
    if (error instanceof InvalidAuthClaim) return NextResponse.json({ error: "验证码无效或已过期" }, { status: 401 });
    throw error;
  }
  return NextResponse.json({ ...tokenResponse(user.id, session.id, refreshToken), account: { linked: true, email: user.email } });
}
