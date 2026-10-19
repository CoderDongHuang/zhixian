import { NextResponse } from "next/server";
import { createSessionToken, hashSecret, isValidEmail, normalizeEmail, SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/auth";
import { readAccountJson, sameOrigin } from "@/lib/account-input";
import { accountError } from "@/lib/account-route";
import { lockAccount } from "@/lib/account-storage";
import { enforceAuthLimits, otpVerifyRules, waitForMinimumDuration } from "@/lib/auth-security";
import { isIsolatedE2e } from "@/lib/e2e-policy";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return accountError("请求来源无效", 403);
  const body = await readAccountJson(request);
  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email) || typeof body?.password !== "string" || body.password.length > 128 || !body.password.length) return accountError("请填写邮箱和密码");
  const e2eMode = await isIsolatedE2e(prisma);
  if (!e2eMode && await enforceAuthLimits(otpVerifyRules(request, email))) return accountError("登录尝试过于频繁，请稍后再试", 429);
  const startedAt = Date.now();
  const user = await prisma.user.findUnique({ where: { email }, include: { accountProfile: { select: { passwordHash: true } } } });
  const encoded = user?.accountProfile?.passwordHash;
  const valid = await verifyPassword(body.password, encoded);
  await waitForMinimumDuration(startedAt);
  if (!valid || !user || !encoded) return accountError("邮箱或密码不正确，可使用邮箱验证码登录", 401);
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  const created = await prisma.$transaction(async tx => {
    await lockAccount(tx, user.id);
    const current = await tx.user.findUnique({ where: { id: user.id }, include: { accountProfile: { select: { passwordHash: true } } } });
    if (current?.email !== email || current?.accountProfile?.passwordHash !== encoded) return false;
    await tx.session.create({ data: { userId: user.id, tokenHash: hashSecret(token), expiresAt } });
    return true;
  });
  if (!created) return accountError("账号信息已更新，请重新登录", 401);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !e2eMode, path: "/", expires: expiresAt });
  return response;
}
