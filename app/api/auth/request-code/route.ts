import { NextResponse } from "next/server";
import { createOtp, hashSecret, isValidEmail, normalizeEmail, OTP_TTL_MINUTES } from "@/lib/auth";
import { sendLoginCode } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const e2eMode = process.env.VERCEL_ENV !== "production" && process.env.E2E_TEST_MODE === "true";
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  const inviteCode = String(body?.inviteCode ?? "").trim();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const invitation = inviteCode ? await prisma.invitation.findUnique({ where: { code: inviteCode } }) : null;
  if (!existingUser && (!invitation || invitation.usedAt || (invitation.expiresAt && invitation.expiresAt < new Date()) || (invitation.email && invitation.email !== email))) {
    return NextResponse.json({ error: "邀请码无效或已使用" }, { status: 403 });
  }

  const recent = e2eMode ? 0 : await prisma.emailOtp.count({ where: { email, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent > 0) return NextResponse.json({ error: "请稍后再获取验证码" }, { status: 429 });

  const code = createOtp();
  await prisma.emailOtp.create({ data: { email, codeHash: hashSecret(code), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000) } });
  if (!e2eMode) await sendLoginCode(email, code);
  return NextResponse.json({ ok: true, ...(e2eMode ? { testCode: code } : {}) });
}
