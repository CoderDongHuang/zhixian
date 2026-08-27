import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { nextReviewSchedule } from "@/lib/learning-policy";
import { prisma } from "@/lib/prisma";

function answers(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 240)] : []))].slice(0, 6);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const submitted = answers(body?.answers);
  if (!submitted.length) return NextResponse.json({ error: "请选择答案" }, { status: 400 });
  const review = await prisma.learningReview.findFirst({ where: { id, userId: user.id } });
  if (!review) return NextResponse.json({ error: "复习卡不存在" }, { status: 404 });
  if (review.dueAt.getTime() > Date.now() + 5 * 60_000) return NextResponse.json({ error: "复习卡尚未到期" }, { status: 409 });
  const expected = answers(review.correctAnswers);
  const correct = submitted.length === expected.length && [...submitted].sort().every((value, index) => value === [...expected].sort()[index]);
  const now = new Date();
  const schedule = nextReviewSchedule({ correct, repetition: review.repetition, intervalDays: review.intervalDays, easeFactor: review.easeFactor }, now);
  await prisma.$transaction([
    prisma.learningReview.update({ where: { id }, data: { ...schedule, lastReviewedAt: now } }),
    prisma.syncChange.create({ data: { userId: user.id, resource: "learning_review", resourceId: id, value: { correct, dueAt: schedule.dueAt.toISOString(), resolved: Boolean(schedule.resolvedAt) } as Prisma.InputJsonValue } }),
  ]);
  return NextResponse.json({ correct, explanation: correct ? "回答正确，复习间隔已延长。" : "回答有误，明天会再次安排。", nextDueAt: schedule.dueAt, resolved: Boolean(schedule.resolvedAt) });
}
