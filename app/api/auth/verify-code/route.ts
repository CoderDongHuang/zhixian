import { NextResponse } from "next/server";
import { createSessionToken, hashSecret, normalizeEmail, SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  const code = String(body?.code ?? "").trim();
  const inviteCode = String(body?.inviteCode ?? "").trim();
  const now = new Date();

  const otp = await prisma.emailOtp.findFirst({ where: { email, codeHash: hashSecret(code), usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } });
  const invitation = await prisma.invitation.findUnique({ where: { code: inviteCode } });
  if (!otp || !invitation || invitation.usedAt || (invitation.expiresAt && invitation.expiresAt < now)) {
    return NextResponse.json({ error: "验证码或邀请码无效" }, { status: 401 });
  }

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({ where: { email }, update: {}, create: { email } });
    await tx.emailOtp.update({ where: { id: otp.id }, data: { usedAt: now } });
    await tx.invitation.update({ where: { id: invitation.id }, data: { usedAt: now } });
    await tx.session.create({ data: { userId: user.id, tokenHash: hashSecret(token), expiresAt } });
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  return response;
}
