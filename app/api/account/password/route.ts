import { NextResponse } from "next/server";
import { hashSecret } from "@/lib/auth";
import { isCode, readAccountJson } from "@/lib/account-input";
import { accountContext, accountError, accountFailure, limitAccountVerification } from "@/lib/account-route";
import { checkAccountCode, consumeAccountCode, requireUnchangedAccount, revokeOtherSessions } from "@/lib/account-storage";
import { hashPassword, validPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const context = await accountContext(request);
  if (context.error) return context.error;
  const { user, tokenHash } = context;
  if (!user.email) return accountError("请先绑定邮箱，再设置密码");
  const body = await readAccountJson(request);
  if (!isCode(body?.code) || !validPassword(body?.password)) return accountError("密码需为 10–128 位，包含英文字母和数字，并填写邮箱验证码");
  if (await limitAccountVerification(request, user.id)) return accountError("验证过于频繁，请稍后再试", 429);
  const verification = await checkAccountCode(prisma, user.id, "password", user.email, hashSecret(body.code));
  if (!verification) return accountError("验证码无效或已过期", 401);
  const passwordHash = await hashPassword(body.password);
  try {
    await prisma.$transaction(async tx => {
      await requireUnchangedAccount(tx, user.id, user.email, tokenHash);
      await consumeAccountCode(tx, verification.id, verification.codeHash);
      await tx.accountProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, passwordHash }, update: { passwordHash } });
      await revokeOtherSessions(tx, user.id, tokenHash);
    });
  } catch (error) { return accountFailure(error); }
  return NextResponse.json({ ok: true });
}
