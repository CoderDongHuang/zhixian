import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePathProgress, calculateQualityScore, gradeLearningExercise, nextReviewSchedule, parseLearningExercise, parseLearningSubmission } from "@/lib/learning-policy";

export class LearningSubmissionError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function submitLearningTask(userId: string, taskId: string, raw: unknown) {
  const submission = parseLearningSubmission(raw);
  if (!submission) throw new LearningSubmissionError("提交内容格式不正确", 400);
  const task = await prisma.learningTask.findFirst({ where: { id: taskId, userId }, include: { prerequisite: { select: { completedAt: true } } } });
  if (!task) throw new LearningSubmissionError("任务不存在", 404);
  if (task.prerequisiteTaskId && !task.prerequisite?.completedAt) throw new LearningSubmissionError("请先完成先修任务", 409);
  const exercise = parseLearningExercise(task.exercise);
  if (!exercise) throw new LearningSubmissionError("任务缺少有效的知识检查", 409);
  const grade = gradeLearningExercise(exercise, submission);
  const qualityScore = calculateQualityScore({ ...grade, ...submission, taskType: task.taskType });
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.learningAttempt.create({ data: {
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
    if (task.pathId) {
      const tasks = await tx.learningTask.findMany({ where: { pathId: task.pathId, taskType: { not: "REVIEW" } }, select: { completedAt: true, qualityScore: true } });
      pathProgress = calculatePathProgress(tasks);
      await tx.learningPath.update({ where: { id: task.pathId }, data: { progress: pathProgress } });
    }
    const value = { completed: true, completedAt: completedAt.toISOString(), pathId: task.pathId, pathProgress, qualityScore };
    await tx.syncState.upsert({ where: { userId_resource_resourceId: { userId, resource: "learning_task", resourceId: taskId } }, update: { value, clientChangedAt: now }, create: { userId, resource: "learning_task", resourceId: taskId, value, clientChangedAt: now } });
    await tx.syncChange.create({ data: { userId, resource: "learning_task", resourceId: taskId, value } });
    return { completed: true, qualityScore, pathProgress, score: grade.score, maxScore: grade.maxScore, feedback: grade.feedback, reviewCount: grade.incorrectConcepts.length };
  });
}
