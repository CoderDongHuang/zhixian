import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DAILY_TASK_PROMPT_VERSION, LEARNING_PATH_PROMPT_VERSION, buildRuleLearningOutline, generateDailyTaskWithAi, generateLearningPathWithAi, type AiLearningPath, type DailyCandidate, type LearningContext, type LearningOutlineItem, type ModelConfig } from "@/lib/learning-ai";

const BEHAVIOR_WEIGHTS: Record<string, number> = { read: 1, listen: 0.8, share: 1.2, bookmark: 1.8, helpful: 1.4, not_helpful: -1 };

export const buildLearningOutline = buildRuleLearningOutline;

export function learningPreferenceFingerprint(value: { identity?: string | null; level?: string | null; skillDirections?: string[]; learningGoals?: string[]; topics?: string[] }) {
  return createHash("sha256").update(JSON.stringify({ identity: value.identity || "", level: value.level || "", skills: [...(value.skillDirections || [])].sort(), goals: [...(value.learningGoals || [])].sort(), topics: [...(value.topics || [])].sort() })).digest("hex");
}

function modelConfig(): ModelConfig | null {
  const key = process.env.LEARNING_AI_API_KEY || process.env.ANALYSIS_AI_API_KEY || process.env.AI_API_KEY;
  const url = process.env.LEARNING_AI_API_URL || process.env.ANALYSIS_AI_API_URL || process.env.AI_API_URL;
  const model = process.env.LEARNING_AI_MODEL || process.env.ANALYSIS_AI_MODEL || process.env.AI_MODEL;
  return key && url && model ? { key, url, model, timeoutMs: Number(process.env.LEARNING_AI_TIMEOUT_MS || 30000) } : null;
}

async function learningContext(userId: string): Promise<{ context: LearningContext; fingerprint: string }> {
  const since = new Date(Date.now() - 90 * 86400000);
  const [preference, behaviors, completed] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.behaviorEvent.findMany({ where: { userId, topic: { not: null }, createdAt: { gte: since } }, select: { topic: true, action: true, value: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.learningTask.findMany({ where: { userId, completedAt: { not: null } }, select: { title: true }, orderBy: { completedAt: "desc" }, take: 20 }),
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
    } catch (error) {
      console.warn(JSON.stringify({ type: "learning-ai-fallback", operation: "path", error: String(error instanceof Error ? error.message : error).slice(0, 300) }));
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
  const existing = await prisma.learningTask.findFirst({ where: { userId, scheduledFor: { gte: start, lt: end } }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;
  const path = await ensureLearningPath(userId);
  const recentTasks = await prisma.learningTask.findMany({ where: { userId }, select: { eventId: true, title: true, completedAt: true }, orderBy: { createdAt: "desc" }, take: 14 });
  const recentEventIds = recentTasks.flatMap((item) => item.eventId ? [item.eventId] : []);
  const feedItems = await prisma.feedItem.findMany({
    where: { eventId: { notIn: recentEventIds }, event: { topic: { in: path.topics } } },
    select: { eventId: true, event: { select: { topic: true, title: true, analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1, select: { summary: true, learnerAdvice: true } } } } },
    orderBy: { publishedAt: "desc" }, take: 8,
  });
  const candidates: DailyCandidate[] = feedItems.map((item) => ({ eventId: item.eventId, topic: item.event.topic || "AI 行业", title: item.event.analyses[0]?.summary || item.event.title, learnerAdvice: item.event.analyses[0]?.learnerAdvice || null }));
  const { context } = await learningContext(userId);
  const config = modelConfig();
  if (config) {
    try {
      const outline = path.outline as unknown as LearningOutlineItem[];
      const aiPath: AiLearningPath = { title: path.title, goal: path.goal, topics: path.topics, outline, reason: path.generationReason || "当前学习路线" };
      const result = await generateDailyTaskWithAi({ ...context, path: aiPath, candidates, recentEventIds }, config);
      return prisma.learningTask.create({ data: { userId, pathId: path.id, eventId: result.eventId || null, title: result.title, description: result.description, reason: result.reason, estimatedMinutes: result.estimatedMinutes, scheduledFor: new Date(), modelVersion: config.model, promptVersion: DAILY_TASK_PROMPT_VERSION, generationReason: result.reason } });
    } catch (error) {
      console.warn(JSON.stringify({ type: "learning-ai-fallback", operation: "daily-task", error: String(error instanceof Error ? error.message : error).slice(0, 300) }));
    }
  }
  const candidate = candidates[0];
  return prisma.learningTask.create({ data: { userId, pathId: path.id, eventId: candidate?.eventId, title: candidate ? `精读：${candidate.title}` : `梳理 ${path.topics[0]} 的三个核心概念`, description: candidate?.learnerAdvice || "用 15 分钟阅读、记录三个要点，再写下一步要验证的问题。", reason: `与你的“${path.goal}”目标和 ${path.level} 阶段匹配，且未在近期任务中出现`, estimatedMinutes: 15, scheduledFor: new Date(), modelVersion: "rules-v1", promptVersion: DAILY_TASK_PROMPT_VERSION, generationReason: config ? "AI 生成不可用，已回退规则任务" : "未配置学习模型，使用规则任务" } });
}
