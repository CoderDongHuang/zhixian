import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DAILY_TASK_PROMPT_VERSION, LEARNING_PATH_PROMPT_VERSION, buildRuleLearningOutline, generateDailyTaskWithAi, generateLearningPathWithAi, type AiLearningPath, type DailyCandidate, type LearningContext, type LearningOutlineItem, type ModelConfig } from "@/lib/learning-ai";
import { chooseAdaptiveTaskType, safeLearningModelConfig, type LearningExercise } from "@/lib/learning-policy";

const BEHAVIOR_WEIGHTS: Record<string, number> = { read: 1, listen: 0.8, share: 1.2, bookmark: 1.8, helpful: 1.4, not_helpful: -1 };

export const buildLearningOutline = buildRuleLearningOutline;

export function learningPreferenceFingerprint(value: { identity?: string | null; level?: string | null; skillDirections?: string[]; learningGoals?: string[]; topics?: string[] }) {
  return createHash("sha256").update(JSON.stringify({ identity: value.identity || "", level: value.level || "", skills: [...(value.skillDirections || [])].sort(), goals: [...(value.learningGoals || [])].sort(), topics: [...(value.topics || [])].sort() })).digest("hex");
}

function modelConfig(): ModelConfig | null {
  const key = process.env.LEARNING_AI_API_KEY || process.env.ANALYSIS_AI_API_KEY || process.env.AI_API_KEY;
  const url = process.env.LEARNING_AI_API_URL || process.env.ANALYSIS_AI_API_URL || process.env.AI_API_URL;
  const model = process.env.LEARNING_AI_MODEL || process.env.ANALYSIS_AI_MODEL || process.env.AI_MODEL;
  return safeLearningModelConfig({ key, url, model, timeoutMs: process.env.LEARNING_AI_TIMEOUT_MS });
}

async function learningContext(userId: string): Promise<{ context: LearningContext; fingerprint: string }> {
  const since = new Date(Date.now() - 90 * 86400000);
  const [preference, behaviors, completed, attempts, reviews] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.behaviorEvent.findMany({ where: { userId, topic: { not: null }, createdAt: { gte: since } }, select: { topic: true, action: true, value: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.learningTask.findMany({ where: { userId, completedAt: { not: null } }, select: { title: true }, orderBy: { completedAt: "desc" }, take: 20 }),
    prisma.learningAttempt.findMany({ where: { userId }, select: { qualityScore: true }, orderBy: { submittedAt: "desc" }, take: 10 }),
    prisma.learningReview.findMany({ where: { userId, resolvedAt: null }, select: { concept: true }, orderBy: { dueAt: "asc" }, take: 8 }),
  ]);
  const scores = new Map<string, number>();
  for (const item of behaviors) if (item.topic) scores.set(item.topic, (scores.get(item.topic) || 0) + (BEHAVIOR_WEIGHTS[item.action] || 0.2) * item.value);
  const context: LearningContext = {
    identity: preference?.identity || "学习者",
    level: preference?.level || "入门",
    skills: preference?.skillDirections.length ? preference.skillDirections : ["AI 应用"],
    goals: preference?.learningGoals.length ? preference.learningGoals : ["提升技能"],
    preferredTopics: preference?.topics || [],
    behaviorTopics: [...scores].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, score]) => ({ topic, score: Math.round(score * 100) / 100 })),
    completedTasks: completed.map((item) => item.title),
    recentQuality: attempts.length ? Math.round(attempts.reduce((total, item) => total + item.qualityScore, 0) / attempts.length) : null,
    weakConcepts: [...new Set(reviews.map((item) => item.concept))],
  };
  return { context, fingerprint: learningPreferenceFingerprint(preference || {}) };
}

async function generatePathData(userId: string) {
  const { context, fingerprint } = await learningContext(userId);
  const config = modelConfig();
  if (config) {
    try {
      const result = await generateLearningPathWithAi(context, config);
      return { title: result.title, goal: result.goal, level: context.level, topics: result.topics, outline: result.outline as unknown as Prisma.InputJsonValue, modelVersion: config.model, promptVersion: LEARNING_PATH_PROMPT_VERSION, generationReason: result.reason, preferenceFingerprint: fingerprint, stale: false };
    } catch {
      console.warn(JSON.stringify({ type: "learning-ai-fallback", operation: "path", reason: "model_request_failed" }));
    }
  }
  const outline = buildLearningOutline(context.level, context.skills, context.goals);
  return { title: `${context.skills[0]} · ${context.goals[0]}路线`, goal: context.goals[0], level: context.level, topics: context.skills, outline: outline as unknown as Prisma.InputJsonValue, modelVersion: "rules-v1", promptVersion: LEARNING_PATH_PROMPT_VERSION, generationReason: config ? "AI 生成不可用，已使用规则路线保证学习连续性" : "未配置学习模型，使用规则路线", preferenceFingerprint: fingerprint, stale: false };
}

export async function regenerateLearningPath(userId: string) {
  const data = await generatePathData(userId);
  return prisma.$transaction(async (tx) => {
    await tx.learningPath.updateMany({ where: { userId, active: true }, data: { active: false } });
    return tx.learningPath.create({ data: { userId, ...data } });
  });
}

export async function ensureLearningPath(userId: string) {
  const existing = await prisma.learningPath.findFirst({ where: { userId, active: true }, orderBy: { updatedAt: "desc" } });
  if (existing) return existing;
  return prisma.learningPath.create({ data: { userId, ...(await generatePathData(userId)) } });
}

export async function ensureDailyTask(userId: string) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const path = await ensureLearningPath(userId);
  const existing = await prisma.learningTask.findFirst({ where: { userId, pathId: path.id, taskType: { not: "REVIEW" }, scheduledFor: { gte: start, lt: end } }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;
  const recentTasks = await prisma.learningTask.findMany({ where: { userId, taskType: { not: "REVIEW" } }, select: { id: true, pathId: true, eventId: true, title: true, completedAt: true, qualityScore: true, exercise: true }, orderBy: { createdAt: "desc" }, take: 14 });
  const recentEventIds = recentTasks.flatMap((item) => item.eventId ? [item.eventId] : []);
  const { context } = await learningContext(userId);
  const topicPool = [...new Set([...path.topics, ...context.preferredTopics, ...context.behaviorTopics.map((item) => item.topic)])].filter(Boolean);
  const candidateSelect = { eventId: true, event: { select: { topic: true, title: true, importance: true, analyses: { where: { status: "AUTO_PUBLISHED" as const }, orderBy: { analyzedAt: "desc" as const }, take: 1, select: { summary: true, learnerAdvice: true } }, mentions: { take: 1, select: { entity: { select: { id: true, name: true } } } } } } };
  let feedItems = await prisma.feedItem.findMany({ where: { eventId: { notIn: recentEventIds }, event: { topic: { in: topicPool }, analyses: { some: { status: "AUTO_PUBLISHED" } } } }, select: candidateSelect, orderBy: [{ event: { importance: "desc" } }, { publishedAt: "desc" }], take: 8 });
  if (!feedItems.length) feedItems = await prisma.feedItem.findMany({ where: { eventId: { notIn: recentEventIds }, event: { analyses: { some: { status: "AUTO_PUBLISHED" } } } }, select: candidateSelect, orderBy: [{ event: { importance: "desc" } }, { publishedAt: "desc" }], take: 8 });
  const candidates: DailyCandidate[] = feedItems.map((item) => ({ eventId: item.eventId, topic: item.event.topic || "AI 行业", title: item.event.title, eventTitle: item.event.title, summary: item.event.analyses[0]?.summary || item.event.title, learnerAdvice: item.event.analyses[0]?.learnerAdvice || null, entityId: item.event.mentions[0]?.entity.id || null, entityName: item.event.mentions[0]?.entity.name || null }));
  const recentQualityItems = recentTasks.filter((item) => item.qualityScore !== null);
  const recentQuality = recentQualityItems.length ? Math.round(recentQualityItems.reduce((total, item) => total + item.qualityScore!, 0) / recentQualityItems.length) : context.recentQuality;
  const developerTrack = /开发|工程|编程|代码|python|api/i.test([context.identity, ...context.skills].join(" "));
  const taskType = chooseAdaptiveTaskType({ recentQuality, developerTrack, completedCount: recentTasks.filter((item) => item.completedAt).length });
  const prerequisiteTaskId = recentTasks.find((item) => item.pathId === path.id && (item.completedAt || item.exercise))?.id || null;
  const buildExercise = (candidate: DailyCandidate | undefined): LearningExercise => {
    const eventTitle = candidate?.eventTitle || candidate?.title || path.topics[0] || "当前学习主题";
    const summary = candidate?.summary || candidate?.learnerAdvice || `理解 ${path.topics[0] || "当前主题"} 的核心概念`;
    const otherTitles = candidates.filter((item) => item.eventId !== candidate?.eventId).map((item) => item.eventTitle || item.title);
    const eventOptions = [...new Set([eventTitle, ...otherTitles, "与本任务无关的通用概念回顾"])].slice(0, 4);
    const summaryOptions = [...new Set([summary, "只记录结论，不检查来源与影响", "忽略行业事件，直接背诵术语"])].slice(0, 4);
    return { version: 1, instructions: "先完成实践产出，再提交知识检查和复盘。", deliverable: taskType === "CODE" ? "写出一段处理该事件结构化数据的伪代码或代码，并说明一个边界条件。" : "提炼三个事实，判断一个影响，并写出下一步验证方法。", questions: [
      { id: "event", concept: "事件识别", prompt: "本任务绑定的真实行业事件是哪一项？", kind: "single", options: eventOptions, correctAnswers: [eventTitle], explanation: `任务依据事件“${eventTitle}”生成。` },
      { id: "judgement", concept: candidate?.entityName ? `${candidate.entityName} 与事件影响` : "核心判断", prompt: "哪一项最接近已发布分析的核心判断？", kind: "single", options: summaryOptions, correctAnswers: [summary], explanation: summary },
    ] };
  };
  const config = modelConfig();
  if (config) {
    try {
      const outline = path.outline as unknown as LearningOutlineItem[];
      const aiPath: AiLearningPath = { title: path.title, goal: path.goal, topics: path.topics, outline, reason: path.generationReason || "当前学习路线" };
      const result = await generateDailyTaskWithAi({ ...context, path: aiPath, candidates, recentEventIds }, config);
      const selected = candidates.find((candidate) => candidate.eventId === result.eventId) || candidates[0];
      return prisma.learningTask.create({ data: { userId, pathId: path.id, eventId: selected?.eventId || null, entityId: selected?.entityId || null, taskType, prerequisiteTaskId, title: result.title, description: result.description, reason: result.reason, exercise: buildExercise(selected) as unknown as Prisma.InputJsonValue, estimatedMinutes: 15, scheduledFor: new Date(), modelVersion: config.model, promptVersion: DAILY_TASK_PROMPT_VERSION, generationReason: result.reason } });
    } catch {
      console.warn(JSON.stringify({ type: "learning-ai-fallback", operation: "daily-task", reason: "model_request_failed" }));
    }
  }
  const candidate = candidates[0];
  const titlePrefix = taskType === "CODE" ? "代码实践" : "事件实践";
  return prisma.learningTask.create({ data: { userId, pathId: path.id, eventId: candidate?.eventId, entityId: candidate?.entityId, taskType, prerequisiteTaskId, title: candidate ? `${titlePrefix}：${candidate.eventTitle || candidate.title}` : `实践：${path.topics[0]} 的三个核心概念`, description: candidate?.learnerAdvice || buildExercise(candidate).deliverable, reason: `与你的“${path.goal}”目标和 ${path.level} 阶段匹配；最近质量${recentQuality === null ? "尚无基线" : `为 ${recentQuality} 分`}，已自适应为${taskType === "CODE" ? "代码" : "实践"}任务`, exercise: buildExercise(candidate) as unknown as Prisma.InputJsonValue, estimatedMinutes: 15, scheduledFor: new Date(), modelVersion: "rules-v1", promptVersion: DAILY_TASK_PROMPT_VERSION, generationReason: config ? "AI 生成不可用，已回退规则任务" : "未配置学习模型，使用规则任务" } });
}
