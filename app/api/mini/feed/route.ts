import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const token = request.headers.get("x-mini-token");
  if (!process.env.MINIPROGRAM_API_TOKEN || token !== process.env.MINIPROGRAM_API_TOKEN) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.feedItem.findMany({
    include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 } } } },
    orderBy: { publishedAt: "desc" }, take: 20,
  });
  return NextResponse.json({ items: items.map((item) => ({ id: item.eventId, topic: item.event.topic, title: item.event.analyses[0]?.summary || item.event.title, summary: item.event.analyses[0]?.whyImportant || "", confidence: item.event.analyses[0]?.confidence || 0, publishedAt: item.publishedAt })) });
}
