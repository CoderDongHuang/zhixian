import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const feedItem = await prisma.feedItem.findUnique({ where: { id }, select: { id: true } });
  if (!feedItem) return NextResponse.json({ error: "内容不存在" }, { status: 404 });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.bookmark.upsert({ where: { userId_feedItemId: { userId: user.id, feedItemId: id } }, update: {}, create: { userId: user.id, feedItemId: id } });
    await tx.syncState.upsert({ where: { userId_resource_resourceId: { userId: user.id, resource: "bookmark", resourceId: id } }, update: { value: { bookmarked: true }, clientChangedAt: now }, create: { userId: user.id, resource: "bookmark", resourceId: id, value: { bookmarked: true }, clientChangedAt: now } });
    await tx.syncChange.create({ data: { userId: user.id, resource: "bookmark", resourceId: id, value: { bookmarked: true } } });
  });
  return NextResponse.json({ bookmarked: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.bookmark.deleteMany({ where: { userId: user.id, feedItemId: id } });
    await tx.syncState.upsert({ where: { userId_resource_resourceId: { userId: user.id, resource: "bookmark", resourceId: id } }, update: { value: { bookmarked: false }, clientChangedAt: now }, create: { userId: user.id, resource: "bookmark", resourceId: id, value: { bookmarked: false }, clientChangedAt: now } });
    await tx.syncChange.create({ data: { userId: user.id, resource: "bookmark", resourceId: id, value: { bookmarked: false } } });
  });
  return NextResponse.json({ bookmarked: false });
}
