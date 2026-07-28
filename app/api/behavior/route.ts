import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const actions = new Set(["view", "read", "listen", "share", "bookmark", "helpful", "not_helpful", "complete_learning"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!actions.has(body?.action)) return NextResponse.json({ error: "无效行为" }, { status: 400 });
  const feedItemId = typeof body.feedItemId === "string" ? body.feedItemId : null;
  const behavior = prisma.behaviorEvent.create({ data: {
    userId: user.id, action: body.action,
    feedItemId,
    eventId: typeof body.eventId === "string" ? body.eventId : null,
    topic: typeof body.topic === "string" ? body.topic.slice(0, 80) : null,
    value: typeof body.value === "number" ? Math.max(0, Math.min(10, body.value)) : 1,
  } });
  if (body.action === "read" && feedItemId) {
    const now = new Date();
    await prisma.$transaction([
      behavior,
      prisma.readHistory.upsert({ where: { userId_feedItemId: { userId: user.id, feedItemId } }, update: { readAt: now }, create: { userId: user.id, feedItemId, readAt: now } }),
      prisma.syncState.upsert({ where: { userId_resource_resourceId: { userId: user.id, resource: "read", resourceId: feedItemId } }, update: { value: { read: true }, clientChangedAt: now }, create: { userId: user.id, resource: "read", resourceId: feedItemId, value: { read: true }, clientChangedAt: now } }),
      prisma.syncChange.create({ data: { userId: user.id, resource: "read", resourceId: feedItemId, value: { read: true } } }),
    ]);
  } else {
    await behavior;
  }
  return NextResponse.json({ ok: true });
}
