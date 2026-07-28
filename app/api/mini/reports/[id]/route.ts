import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateMiniRequest } from "@/lib/mini-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 }, documents: { include: { document: { include: { source: true } } } } } });
  const analysis = event?.analyses[0]; if (!event || !analysis) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id, topic: event.topic, title: analysis.summary, whyImportant: analysis.whyImportant, learnerAdvice: analysis.learnerAdvice, confidence: analysis.confidence, trial: true, sources: event.documents.slice(0, 3).map(({ document }) => ({ name: document.source.name, title: document.title })) });
}
