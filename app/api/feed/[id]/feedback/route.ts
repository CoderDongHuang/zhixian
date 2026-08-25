import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const helpful = typeof body?.helpful === "boolean" ? body.helpful : null;
  const report = typeof body?.report === "string" ? body.report.trim().slice(0, 1000) : null;
  if (helpful === null && !report) return NextResponse.json({ error: "请选择反馈或填写问题" }, { status: 400 });
  const feedItem = await prisma.feedItem.findUnique({ where: { id }, select: { id: true } });
  if (!feedItem) return NextResponse.json({ error: "内容不存在" }, { status: 404 });
  const existing = await prisma.feedback.findFirst({ where: { userId: user.id, feedItemId: id } });
  const data = {
    ...(helpful !== null ? { helpful } : {}),
    ...(report ? { report, correctionStatus: "PENDING" as const, resolution: null, resolvedAt: null } : {}),
  };
  if (existing) await prisma.feedback.update({ where: { id: existing.id }, data });
  else await prisma.feedback.create({ data: { userId: user.id, feedItemId: id, ...data } });
  return NextResponse.json({ ok: true });
}
