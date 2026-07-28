import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) return NextResponse.json({ error: "订阅数据无效" }, { status: 400 });
  await prisma.deviceSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: request.headers.get("user-agent") },
    create: { userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: request.headers.get("user-agent") },
  });
  await prisma.userPreference.update({ where: { userId: user.id }, data: { pushEnabled: true } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.endpoint) await prisma.deviceSubscription.deleteMany({ where: { userId: user.id, endpoint: body.endpoint } });
  if (await prisma.deviceSubscription.count({ where: { userId: user.id } }) === 0) await prisma.userPreference.update({ where: { userId: user.id }, data: { pushEnabled: false } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
