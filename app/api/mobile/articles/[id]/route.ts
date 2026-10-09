import { NextResponse } from "next/server";
import { authenticateMiniRequest } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.feedItem.findFirst({ where: { id, event: { isPublic: true } }, include: { bookmarks: { where: { userId: auth.user.id }, select: { id: true } }, event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 1 }, documents: { include: { document: { include: { source: true } } } } } } } });
  const analysis = item?.event.analyses[0];
  if (!item || !analysis) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: item.id, eventId: item.eventId, bookmarked: item.bookmarks.length > 0, topic: item.event.topic, title: analysis.summary || item.event.title, summary: analysis.whyImportant || "", whyImportant: analysis.whyImportant, learnerAdvice: analysis.learnerAdvice, confidence: analysis.confidence, publishedAt: item.publishedAt, sources: item.event.documents.slice(0, 5).map(({ document }) => ({ name: document.source.name, title: document.title })) });
}
