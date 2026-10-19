import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createOtp, hashSecret, isValidEmail, normalizeEmail, OTP_TTL_MINUTES } from "@/lib/auth";
import { readAccountJson } from "@/lib/account-input";
import { accountContext, accountError, accountFailure } from "@/lib/account-route";
import { requireUnchangedAccount, type AccountPurpose } from "@/lib/account-storage";
import { enforceAuthLimits, otpRequestRules } from "@/lib/auth-security";
import { isIsolatedE2e } from "@/lib/e2e-policy";
import { sendLoginCode } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const context = await accountContext(request);
  if (context.error) return context.error;
  const body = await readAccountJson(request);
  if (!body || !["email-current", "email-new", "password"].includes(String(body.purpose))) return accountError("请选择有效的验证用途");
  const purpose = body.purpose as AccountPurpose;
  const email = purpose === "email-new" ? normalizeEmail(body.email) : context.user.email;
  if (!email || !isValidEmail(email)) return accountError("请先绑定有效邮箱");
  if (purpose === "email-new" && email === context.user.email) return accountError("新邮箱不能与当前邮箱相同");
  const e2eMode = await isIsolatedE2e(prisma);
  if (!e2eMode && await enforceAuthLimits([
    ...otpRequestRules(request, email),
    { scope: "account-code-user-hour", subject: context.user.id, limit: 8, windowMs: 3_600_000, blockMs: 3_600_000 },
  ])) return accountError("发送过于频繁，请稍后再试", 429);
  const code = createOtp();
  const id = randomUUID();
  try {
    await prisma.$transaction(async tx => {
      await requireUnchangedAccount(tx, context.user.id, context.user.email, context.tokenHash);
      const data = { id, email, codeHash: hashSecret(code), attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000) };
      await tx.accountVerification.upsert({ where: { userId_purpose: { userId: context.user.id, purpose } }, create: { ...data, userId: context.user.id, purpose }, update: data });
    });
  } catch (error) { return accountFailure(error); }
  if (!e2eMode) {
    try { await sendLoginCode(email, code, { purpose: purpose === "password" ? "修改密码" : "更换邮箱" }); }
    catch {
      await prisma.accountVerification.deleteMany({ where: { id } });
      return accountError("邮件发送失败，请稍后重试", 503);
    }
  }
  return NextResponse.json({ ok: true, ...(e2eMode ? { testCode: code } : {}) });
}
