import { NextResponse } from "next/server";
import { hashSecret, isValidEmail, normalizeEmail } from "@/lib/auth";
import { isCode, readAccountJson } from "@/lib/account-input";
import { accountContext, accountError, accountFailure, limitAccountVerification } from "@/lib/account-route";
import { checkAccountCode, consumeAccountCode, requireUnchangedAccount, revokeOtherSessions } from "@/lib/account-storage";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const context = await accountContext(request);
  if (context.error) return context.error;
  const { user, tokenHash } = context;
  const body = await readAccountJson(request);
  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email) || email === user.email || !isCode(body?.newCode) || (user.email && !isCode(body?.currentCode))) return accountError("请填写新邮箱及完整的验证码");
  if (await limitAccountVerification(request, user.id)) return accountError("验证过于频繁，请稍后再试", 429);
  const current = user.email ? await checkAccountCode(prisma, user.id, "email-current", user.email, hashSecret(body!.currentCode as string)) : null;
  const target = await checkAccountCode(prisma, user.id, "email-new", email, hashSecret(body!.newCode as string));
  if ((user.email && !current) || !target) return accountError("验证码无效或已过期", 401);
  try {
    await prisma.$transaction(async tx => {
      await requireUnchangedAccount(tx, user.id, user.email, tokenHash);
      if (current) await consumeAccountCode(tx, current.id, current.codeHash);
      await consumeAccountCode(tx, target.id, target.codeHash);
      // Invalidate login codes before changing the email, including the old address.
      await revokeOtherSessions(tx, user.id, tokenHash);
      await tx.emailOtp.updateMany({ where: { email, usedAt: null }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { email } });
    });
  } catch (error) { return accountFailure(error); }
  return NextResponse.json({ ok: true, email });
}
