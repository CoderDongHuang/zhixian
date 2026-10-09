import { isIsolatedE2e } from "@/lib/e2e-policy";
import { parseAuthInput } from "@/lib/auth-input";
import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { enforceAuthLimits, otpVerifyRules, verifyLatestOtp } from "@/lib/auth-security";
import { authenticateMiniRequest } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";
import { consumeOtp, InvalidAuthClaim } from "@/lib/auth-claim";

export async function POST(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await parseAuthInput(request, "bind");
  if (!body) return NextResponse.json({ error: "认证请求格式无效" }, { status: 400 });
  const email = normalizeEmail(body?.email || "");
  const code = String(body?.code || "").trim();
  if (!isValidEmail(email) || !code) return NextResponse.json({ error: "valid email and code are required" }, { status: 400 });
  const now = new Date();
  const e2eMode = await isIsolatedE2e(prisma);
  if (!e2eMode && await enforceAuthLimits(otpVerifyRules(request, email, auth.session.deviceId))) {
    return NextResponse.json({ error: "verification failed; try again later" }, { status: 429 });
  }
  const otp = await verifyLatestOtp(email, code, now);
  const target = await prisma.user.findUnique({ where: { email } });
  if (!otp || !target) return NextResponse.json({ error: "invalid code or account" }, { status: 401 });
  if (target.id === auth.user.id) {
    const consumed = await prisma.emailOtp.updateMany({ where: { id: otp.id, usedAt: null, lockedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: now } });
    if (consumed.count !== 1) return NextResponse.json({ error: "invalid code or account" }, { status: 401 });
    return NextResponse.json({ ok: true, account: { linked: true, email } });
  }
  try {
    await prisma.$transaction(async (tx) => {
    await consumeOtp(tx, otp.id);
    const [bookmarks, reads] = await Promise.all([
      tx.bookmark.findMany({ where: { userId: auth.user.id }, select: { feedItemId: true, createdAt: true } }),
      tx.readHistory.findMany({ where: { userId: auth.user.id }, select: { feedItemId: true, readAt: true } }),
    ]);
    if (bookmarks.length) await tx.bookmark.createMany({ data: bookmarks.map((item) => ({ userId: target.id, ...item })), skipDuplicates: true });
    if (reads.length) await tx.readHistory.createMany({ data: reads.map((item) => ({ userId: target.id, ...item })), skipDuplicates: true });
    await tx.bookmark.deleteMany({ where: { userId: auth.user.id } });
    await tx.readHistory.deleteMany({ where: { userId: auth.user.id } });
    await tx.behaviorEvent.updateMany({ where: { userId: auth.user.id }, data: { userId: target.id } });
    await tx.learningPath.updateMany({ where: { userId: auth.user.id }, data: { userId: target.id } });
    await tx.learningTask.updateMany({ where: { userId: auth.user.id }, data: { userId: target.id } });
    await tx.learningAttempt.updateMany({ where: { userId: auth.user.id }, data: { userId: target.id } });
    await tx.learningReview.updateMany({ where: { userId: auth.user.id }, data: { userId: target.id } });
    await tx.wechatIdentity.updateMany({ where: { userId: auth.user.id }, data: { userId: target.id } });
    await tx.miniSession.updateMany({ where: { userId: auth.user.id }, data: { userId: target.id } });
    });
  } catch (error) {
    if (error instanceof InvalidAuthClaim) return NextResponse.json({ error: "invalid code or account" }, { status: 401 });
    throw error;
  }
  return NextResponse.json({ ok: true, account: { linked: true, email }, accessTokenInvalidated: true });
}

export async function DELETE(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!auth.user.email) return NextResponse.json({ error: "account is not linked" }, { status: 409 });
  const detached = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { preference: { create: { topics: ["AI 行业", "大模型", "GitHub 开源项目"] } } } });
    await tx.wechatIdentity.updateMany({ where: { userId: auth.user.id }, data: { userId: user.id } });
    await tx.miniSession.updateMany({ where: { userId: auth.user.id }, data: { userId: user.id } });
    return user;
  });
  return NextResponse.json({ ok: true, account: { linked: false, email: null }, userId: detached.id, accessTokenInvalidated: true });
}
