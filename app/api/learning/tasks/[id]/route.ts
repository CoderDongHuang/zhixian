import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.learningTask.findFirst({ where: { id, userId: user.id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  const completedAt = task.completedAt ? null : new Date();
  await prisma.learningTask.update({ where: { id }, data: { completedAt } });
  if (task.pathId) {
    const [all, done] = await Promise.all([
      prisma.learningTask.count({ where: { pathId: task.pathId } }),
      prisma.learningTask.count({ where: { pathId: task.pathId, completedAt: { not: null } } }),
    ]);
    await prisma.learningPath.update({ where: { id: task.pathId }, data: { progress: all ? Math.round((done / all) * 100) : 0 } });
  }
  return NextResponse.json({ completed: Boolean(completedAt) });
}
