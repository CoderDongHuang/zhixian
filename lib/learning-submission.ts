import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { calculatePathProgress, calculateQualityScore, gradeLearningExercise, nextReviewSchedule, parseLearningExercise, parseLearningSubmission } from "@/lib/learning-policy";

export class LearningSubmissionError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type SubmissionResult = { completed: boolean; qualityScore: number; pathProgress: number | null; score: number; maxScore: number; feedback: { id: string; concept: string; correct: boolean; explanation: string }[]; reviewCount: number };

export async function submitLearningTask(userId: string, taskId: string, raw: unknown, requestId: string | null) {
  const submission = parseLearningSubmission(raw);
  if (!submission) throw new LearningSubmissionError("提交内容格式不正确", 400);
  const task = await prisma.learningTask.findFirst({ where: { id: taskId, userId }, select: { pathId: true } });
  if (!task) throw new LearningSubmissionError("任务不存在", 404);
  if (!requestId || !/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) throw new LearningSubmissionError("缺少有效的作答请求标识", 400);
  const requestHash = createHash("sha256").update(JSON.stringify({ ...submission, answers: Object.fromEntries(Object.entries(submission.answers).sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, [...values].sort()])) })).digest("hex");

  return prisma.$transaction(async (tx) => {
    // Lock the shared path before its task so concurrent tasks cannot lose progress updates.
    if (task.pathId) await tx.$queryRaw`SELECT "id" FROM "LearningPath" WHERE "id" = ${task.pathId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "LearningTask" WHERE "id" = ${taskId} AND "userId" = ${userId} FOR UPDATE`;
    const current = await tx.learningTask.findFirst({ where: { id: taskId, userId }, include: { prerequisite: { select: { completedAt: true } } } });
    if (!current) throw new LearningSubmissionError("任务不存在", 404);
    const previous = await tx.learningAttempt.findUnique({ where: { userId_taskId_requestId: { userId, taskId, requestId } } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new LearningSubmissionError("同一作答标识不能用于不同内容", 409);
      return previous.response as SubmissionResult;
    }
    if (current.prerequisiteTaskId && !current.prerequisite?.completedAt) throw new LearningSubmissionError("请先完成先修任务", 409);
    const exercise = parseLearningExercise(current.exercise);
    if (!exercise) throw new LearningSubmissionError("任务缺少有效的知识检查", 409);
    const grade = gradeLearningExercise(exercise, submission);
    const qualityScore = calculateQualityScore({ ...grade, ...submission, taskType: current.taskType });
    const now = new Date();
    const attempt = await tx.learningAttempt.create({ data: {
      requestId, requestHash,
      userId, taskId, answers: submission.answers, score: grade.score, maxScore: grade.maxScore, qualityScore,
      feedback: grade.feedback, incorrectConcepts: grade.incorrectConcepts,
    } });
    const reviewDates: Date[] = [];
    for (const question of exercise.questions) {
      const correct = Boolean(grade.feedback.find((item) => item.id === question.id)?.correct);
      const existing = await tx.learningReview.findUnique({ where: { userId_taskId_concept: { userId, taskId, concept: question.concept } } });
      const schedule = nextReviewSchedule({ correct, repetition: existing?.repetition || 0, intervalDays: existing?.intervalDays || 1, easeFactor: existing?.easeFactor || 2.5 }, now);
      reviewDates.push(schedule.dueAt);
      const data = { prompt: question.prompt, options: question.options as Prisma.InputJsonValue, correctAnswers: question.correctAnswers as Prisma.InputJsonValue, ...schedule, lastReviewedAt: now };
      await tx.learningReview.upsert({ where: { userId_taskId_concept: { userId, taskId, concept: question.concept } }, update: data, create: { userId, taskId, concept: question.concept, ...data } });
    }
    const completedAt = now;
    await tx.learningTask.update({ where: { id: taskId }, data: {
      completedAt, qualityScore, selfRating: submission.selfRating, reflection: submission.reflection || null,
      attemptCount: { increment: 1 }, lastAttemptAt: now, nextReviewAt: reviewDates.sort((a, b) => a.getTime() - b.getTime())[0] || null,
    } });
    let pathProgress: number | null = null;
    if (current.pathId) {
      const tasks = await tx.learningTask.findMany({ where: { pathId: current.pathId, taskType: { not: "REVIEW" } }, select: { completedAt: true, qualityScore: true } });
      pathProgress = calculatePathProgress(tasks);
      await tx.learningPath.update({ where: { id: current.pathId }, data: { progress: pathProgress } });
    }
    const value = { completed: true, completedAt: completedAt.toISOString(), pathId: current.pathId, pathProgress, qualityScore };
    await tx.syncState.upsert({ where: { userId_resource_resourceId: { userId, resource: "learning_task", resourceId: taskId } }, update: { value, clientChangedAt: now }, create: { userId, resource: "learning_task", resourceId: taskId, value, clientChangedAt: now } });
    await tx.syncChange.create({ data: { userId, resource: "learning_task", resourceId: taskId, value } });
    const response = { completed: true, qualityScore, pathProgress, score: grade.score, maxScore: grade.maxScore, feedback: grade.feedback, reviewCount: grade.incorrectConcepts.length };
    await tx.learningAttempt.update({ where: { id: attempt.id }, data: { response } });
    return response;
  });
}
