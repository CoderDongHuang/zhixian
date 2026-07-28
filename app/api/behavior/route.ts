import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const actions = new Set(["view", "read", "listen", "share", "bookmark", "helpful", "not_helpful", "complete_learning"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!actions.has(body?.action)) return NextResponse.json({ error: "无效行为" }, { status: 400 });
  await prisma.behaviorEvent.create({ data: {
    userId: user.id, action: body.action,
    feedItemId: typeof body.feedItemId === "string" ? body.feedItemId : null,
    eventId: typeof body.eventId === "string" ? body.eventId : null,
    topic: typeof body.topic === "string" ? body.topic.slice(0, 80) : null,
    value: typeof body.value === "number" ? Math.max(0, Math.min(10, body.value)) : 1,
  } });
  return NextResponse.json({ ok: true });
}
