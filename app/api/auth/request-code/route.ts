import { isIsolatedE2e } from "@/lib/e2e-policy";
import { parseAuthInput } from "@/lib/auth-input";
import { NextResponse } from "next/server";
import { createOtp, hashSecret, isValidEmail, normalizeEmail, OTP_TTL_MINUTES } from "@/lib/auth";
import { enforceAuthLimits, getDeviceSubject, otpRequestRules, recordSecurityEvent, waitForMinimumDuration } from "@/lib/auth-security";
import { sendLoginCode } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const e2eMode = await isIsolatedE2e(prisma);
  const body = await parseAuthInput(request, "request");
  if (!body) return NextResponse.json({ error: "认证请求格式无效" }, { status: 400 });
  const email = normalizeEmail(body?.email ?? "");
  const inviteCode = String(body?.inviteCode ?? "").trim();
  const deviceId = getDeviceSubject(request, String(body?.deviceId ?? ""));

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
  }

  if (!e2eMode && await enforceAuthLimits(otpRequestRules(request, email, deviceId))) {
    await waitForMinimumDuration(startedAt);
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const invitation = inviteCode ? await prisma.invitation.findUnique({ where: { code: inviteCode } }) : null;
  const eligible = Boolean(existingUser || (invitation && !invitation.usedAt && (!invitation.expiresAt || invitation.expiresAt >= new Date()) && (!invitation.email || invitation.email === email)));
  let code: string | undefined;
  if (eligible) {
    code = createOtp();
    const otp = await prisma.emailOtp.create({ data: { email, codeHash: hashSecret(code), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000) } });
    if (!e2eMode) {
      await sendLoginCode(email, code).catch(async (error) => {
        await prisma.emailOtp.update({ where: { id: otp.id }, data: { lockedAt: new Date(), usedAt: new Date() } });
        await recordSecurityEvent("otp_delivery_failed", email, { message: String(error).slice(0, 200) });
      });
    }
  } else {
    await recordSecurityEvent("otp_request_suppressed", email, { reason: "ineligible" });
  }
  await waitForMinimumDuration(startedAt);
  return NextResponse.json({ ok: true, message: "如果账号和邀请码有效，验证码将发送到该邮箱", ...(e2eMode && code ? { testCode: code } : {}) });
}
