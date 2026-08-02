import { NextResponse } from "next/server";
import { authenticateMiniRequest } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim().slice(0, 512) : "";
  const platform = body?.platform === "ios" ? "ios" : body?.platform === "android" ? "android" : "";
  const categories = { digest: body?.categories?.digest !== false, learning: body?.categories?.learning !== false };
  if (!token.startsWith("ExponentPushToken[") || !platform) return NextResponse.json({ error: "invalid push registration" }, { status: 400 });
  await prisma.deviceSubscription.upsert({
    where: { endpoint: token },
    update: { userId: auth.user.id, platform, p256dh: "expo", auth: "expo", categories, userAgent: request.headers.get("user-agent") },
    create: { userId: auth.user.id, endpoint: token, platform, p256dh: "expo", auth: "expo", categories, userAgent: request.headers.get("user-agent") },
  });
  await prisma.userPreference.update({ where: { userId: auth.user.id }, data: { pushEnabled: true } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (token) await prisma.deviceSubscription.deleteMany({ where: { userId: auth.user.id, endpoint: token, platform: { in: ["ios", "android"] } } });
  if (await prisma.deviceSubscription.count({ where: { userId: auth.user.id } }) === 0) await prisma.userPreference.update({ where: { userId: auth.user.id }, data: { pushEnabled: false } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
