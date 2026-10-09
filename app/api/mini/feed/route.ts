import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateMiniRequest } from "@/lib/mini-auth";

export async function GET(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.feedItem.findMany({
    where: { event: { analyses: { some: { status: "AUTO_PUBLISHED" } } } },
    include: { bookmarks: { where: { userId: auth.user.id }, select: { id: true } }, event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 } } } },
    orderBy: { publishedAt: "desc" }, take: 20,
  });
  return NextResponse.json({ items: items.map((item) => ({ id: item.id, eventId: item.eventId, bookmarked: item.bookmarks.length > 0, topic: item.event.topic, title: item.event.analyses[0]?.summary || item.event.title, summary: item.event.analyses[0]?.whyImportant || "", confidence: item.event.analyses[0]?.confidence || 0, publishedAt: item.publishedAt })) });
}
