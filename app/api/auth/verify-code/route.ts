import { NextResponse } from "next/server";
import { createSessionToken, hashSecret, normalizeEmail, SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/auth";
import { enforceAuthLimits, otpVerifyRules, verifyLatestOtp } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";
import { claimWebAccount, InvalidAuthClaim } from "@/lib/auth-claim";

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
  if (!otp) {
    return NextResponse.json({ error: "验证码或邀请码无效" }, { status: 401 });
  }

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  try {
    await prisma.$transaction(async (tx) => {
    const user = await claimWebAccount(tx, email, inviteCode, otp.id);
    await tx.session.create({ data: { userId: user.id, tokenHash: hashSecret(token), expiresAt } });
    });
  } catch (error) {
    if (error instanceof InvalidAuthClaim) return NextResponse.json({ error: "验证码或邀请码无效" }, { status: 401 });
    throw error;
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !e2eMode, path: "/", expires: expiresAt });
  return response;
}
