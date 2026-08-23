import { NextResponse } from "next/server";
import { createSessionToken, hashSecret, normalizeEmail, SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/auth";
import { enforceAuthLimits, otpVerifyRules, verifyLatestOtp } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  const code = String(body?.code ?? "").trim();
  const inviteCode = String(body?.inviteCode ?? "").trim();
  const e2eMode = process.env.VERCEL_ENV !== "production" && process.env.E2E_TEST_MODE === "true";
  const now = new Date();

  if (!e2eMode && await enforceAuthLimits(otpVerifyRules(request, email, String(body?.deviceId ?? "")))) {
    return NextResponse.json({ error: "验证失败，请稍后再试" }, { status: 429 });
  }
  const otp = await verifyLatestOtp(email, code, now);
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const invitation = inviteCode ? await prisma.invitation.findUnique({ where: { code: inviteCode } }) : null;
  if (!otp || (!existingUser && (!invitation || invitation.usedAt || (invitation.expiresAt && invitation.expiresAt < now)))) {
    return NextResponse.json({ error: "验证码或邀请码无效" }, { status: 401 });
  }

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({ where: { email }, update: {}, create: { email } });
    await tx.userPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, topics: ["AI 行业", "大模型", "GitHub 开源项目"] } });
    const consumed = await tx.emailOtp.updateMany({ where: { id: otp.id, usedAt: null, lockedAt: null }, data: { usedAt: now } });
    if (consumed.count !== 1) throw new Error("OTP was already consumed");
    if (!existingUser && invitation) await tx.invitation.update({ where: { id: invitation.id }, data: { usedAt: now } });
    await tx.session.create({ data: { userId: user.id, tokenHash: hashSecret(token), expiresAt } });
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  return response;
}
