import { prisma } from "@/lib/prisma";

type OutlineItem = { phase: string; objective: string; weeks: number; topics: string[] };

export function buildLearningOutline(level: string, skills: string[], goals: string[]): OutlineItem[] {
  const direction = skills[0] || "AI 应用";
  const goal = goals[0] || "提升技能";
  return [
    { phase: "建立地图", objective: `理解 ${direction} 的核心概念与行业位置`, weeks: 1, topics: ["基础概念", "关键参与者", "技术脉络"] },
    { phase: "形成能力", objective: `围绕“${goal}”完成可验证的实践`, weeks: level === "入门" ? 3 : 2, topics: ["工具链", "案例拆解", "动手实践"] },
    { phase: "持续进阶", objective: "跟踪重要变化并形成自己的判断", weeks: 2, topics: ["前沿进展", "方案比较", "复盘输出"] },
  ];
}

export async function ensureLearningPath(userId: string) {
  const existing = await prisma.learningPath.findFirst({ where: { userId, active: true }, orderBy: { updatedAt: "desc" } });
  if (existing) return existing;
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  const level = preference?.level || "入门";
  const skills = preference?.skillDirections || ["AI 应用"];
  const goals = preference?.learningGoals || ["提升技能"];
  return prisma.learningPath.create({ data: { userId, title: `${skills[0]} · ${goals[0]}路线`, goal: goals[0], level, topics: skills, outline: buildLearningOutline(level, skills, goals) } });
}

export async function ensureDailyTask(userId: string) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const existing = await prisma.learningTask.findFirst({ where: { userId, scheduledFor: { gte: start, lt: end } }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;
  const path = await ensureLearningPath(userId);
  const recent = await prisma.feedItem.findFirst({
    where: { event: { topic: { in: path.topics } } },
    include: { event: { include: { analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1 } } } },
    orderBy: { publishedAt: "desc" },
  });
  const analysis = recent?.event.analyses[0];
  return prisma.learningTask.create({ data: {
    userId, pathId: path.id, eventId: recent?.eventId,
    title: analysis ? `精读：${analysis.summary}` : `梳理 ${path.topics[0]} 的三个核心概念`,
    description: analysis?.learnerAdvice || "用 15 分钟阅读、记录三个要点，再写下一步要验证的问题。",
    reason: `与你的“${path.goal}”目标和 ${path.level} 阶段匹配`, estimatedMinutes: 15, scheduledFor: new Date(),
  } });
}
