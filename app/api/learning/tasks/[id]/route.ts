import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePathProgress } from "@/lib/learning-policy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.learningTask.findFirst({ where: { id, userId: user.id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (task.exercise) return NextResponse.json({ error: "请提交知识检查完成此任务" }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const completed = typeof body.completed === "boolean" ? body.completed : true;
  const completedAt = completed ? task.completedAt || new Date() : null;
  return NextResponse.json(await prisma.$transaction(async (tx) => {
    await tx.learningTask.update({ where: { id }, data: { completedAt, qualityScore: completed ? task.qualityScore ?? 60 : null } });
    let pathProgress: number | null = null;
    if (task.pathId) {
      const tasks = await tx.learningTask.findMany({ where: { pathId: task.pathId, taskType: { not: "REVIEW" } }, select: { completedAt: true, qualityScore: true } });
      pathProgress = calculatePathProgress(tasks);
      await tx.learningPath.update({ where: { id: task.pathId }, data: { progress: pathProgress } });
    }
    const value = { completed, completedAt: completedAt?.toISOString() || null, pathId: task.pathId, pathProgress, qualityScore: completed ? task.qualityScore ?? 60 : null };
    await tx.syncState.upsert({ where: { userId_resource_resourceId: { userId: user.id, resource: "learning_task", resourceId: id } }, update: { value, clientChangedAt: new Date() }, create: { userId: user.id, resource: "learning_task", resourceId: id, value, clientChangedAt: new Date() } });
    await tx.syncChange.create({ data: { userId: user.id, resource: "learning_task", resourceId: id, value } });
    return { completed, pathProgress };
  }));
}
