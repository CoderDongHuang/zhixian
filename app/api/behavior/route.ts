import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimits } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";

const actions = new Set(["view", "read", "listen", "share", "bookmark", "helpful", "not_helpful", "complete_learning"]);
const feedRequired = new Set(["read", "bookmark", "helpful", "not_helpful"]);
const contentRequired = new Set(["view", "read", "listen", "share", "bookmark", "helpful", "not_helpful"]);
const actionValues: Record<string, number> = { view: 0.5, read: 1, listen: 1, share: 2, bookmark: 2, helpful: 1.5, not_helpful: -1, complete_learning: 2 };

function cleanId(value: unknown) { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null; }
function dedupeKey(userId: string, action: string, resourceId: string, now = Date.now()) {
  const bucket = Math.floor(now / (5 * 60_000));
  return createHash("sha256").update(`${userId}:${action}:${resourceId}:${bucket}`).digest("hex");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!actions.has(body?.action)) return NextResponse.json({ error: "无效行为" }, { status: 400 });
  if (await enforceRateLimits([{ scope: "behavior-user-minute", subject: user.id, limit: 60, windowMs: 60_000, blockMs: 60_000 }], "behavior_rate_limited")) return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });

  const feedItemId = cleanId(body?.feedItemId);
  const suppliedEventId = cleanId(body?.eventId);
  if (feedRequired.has(body.action) && !feedItemId) return NextResponse.json({ error: "缺少内容标识" }, { status: 400 });
  if (contentRequired.has(body.action) && !feedItemId && !suppliedEventId) return NextResponse.json({ error: "缺少内容标识" }, { status: 400 });

  const [feedItem, suppliedEvent] = await Promise.all([
    feedItemId ? prisma.feedItem.findUnique({ where: { id: feedItemId, event: { isPublic: true } }, select: { eventId: true, event: { select: { topic: true } } } }) : null,
    suppliedEventId && !feedItemId ? prisma.event.findUnique({ where: { id: suppliedEventId, isPublic: true }, select: { id: true, topic: true } }) : null,
  ]);
  if (feedItemId && !feedItem) return NextResponse.json({ error: "内容不存在" }, { status: 404 });
  if (suppliedEventId && feedItem && suppliedEventId !== feedItem.eventId) return NextResponse.json({ error: "内容关联不匹配" }, { status: 400 });
  if (suppliedEventId && !feedItemId && !suppliedEvent) return NextResponse.json({ error: "事件不存在" }, { status: 404 });

  const eventId = feedItem?.eventId || suppliedEvent?.id || null;
  const topic = feedItem?.event.topic || suppliedEvent?.topic || null;
  const resourceId = feedItemId || eventId || "general";
  const behavior = prisma.behaviorEvent.upsert({
    where: { dedupeKey: dedupeKey(user.id, body.action, resourceId) },
    update: { value: actionValues[body.action] ?? 1, topic },
    create: { userId: user.id, action: body.action, feedItemId, eventId, topic, value: actionValues[body.action] ?? 1, dedupeKey: dedupeKey(user.id, body.action, resourceId) },
  });
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
