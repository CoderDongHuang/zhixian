import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser, hashSecret, SESSION_COOKIE } from "@/lib/auth";
import { sameOrigin } from "@/lib/account-input";
import { enforceAuthLimits, otpVerifyRules } from "@/lib/auth-security";
import { isIsolatedE2e } from "@/lib/e2e-policy";
import { prisma } from "@/lib/prisma";

export const accountError = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function accountContext(request: Request) {
  if (!sameOrigin(request)) return { error: accountError("请求来源无效", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: accountError("请先登录", 401) };
  const token = (await cookies()).get(SESSION_COOKIE)!.value;
  return { user, tokenHash: hashSecret(token) };
}

export async function limitAccountVerification(request: Request, userId: string) {
  return !await isIsolatedE2e(prisma) && await enforceAuthLimits(otpVerifyRules(request, `account:${userId}`));
}

export function accountFailure(error: unknown) {
  if (error instanceof Error && error.message === "ACCOUNT_CODE_EXPIRED") return accountError("验证已失效，请重新获取验证码", 409);
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return accountError("该邮箱已被使用，请选择其他邮箱", 409);
  throw error;
}
