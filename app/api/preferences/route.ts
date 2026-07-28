import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const allowedTopics = new Set(["AI 行业", "大模型", "GitHub 开源项目"]);
const allowedCounts = new Set([5, 10, 20]);
const allowedSkills = new Set(["AI 应用", "Java 后端", "Python", "前端", "暂未确定"]);
const allowedGoals = new Set(["了解行业", "提升技能", "找工作", "技术选型", "创业研究"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const topics = Array.isArray(body?.topics) ? body.topics.filter((topic: unknown): topic is string => typeof topic === "string" && allowedTopics.has(topic)) : [];
  const skillDirections = Array.isArray(body?.skillDirections) ? body.skillDirections.filter((value: unknown): value is string => typeof value === "string" && allowedSkills.has(value)) : [];
  const learningGoals = Array.isArray(body?.learningGoals) ? body.learningGoals.filter((value: unknown): value is string => typeof value === "string" && allowedGoals.has(value)) : [];
  const itemsPerDigest = Number(body?.itemsPerDigest);
  if (!allowedCounts.has(itemsPerDigest)) return NextResponse.json({ error: "内容数量设置无效" }, { status: 400 });
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const morningTime = timePattern.test(body?.morningTime) ? body.morningTime : "08:00";
  const eveningTime = timePattern.test(body?.eveningTime) ? body.eveningTime : "20:00";
  const weeklyDay = Math.max(0, Math.min(6, Number(body?.weeklyDay) || 0));
  const dailyLearningTime = timePattern.test(body?.dailyLearningTime) ? body.dailyLearningTime : "07:30";
  const delivery = { morningTime, eveningTime, timezone: "Asia/Shanghai", emailEnabled: Boolean(body?.emailEnabled), morningEnabled: Boolean(body?.morningEnabled), eveningEnabled: Boolean(body?.eveningEnabled), weeklyEnabled: Boolean(body?.weeklyEnabled), weeklyDay, dailyLearningEnabled: Boolean(body?.dailyLearningEnabled), dailyLearningTime };

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: { identity: body.identity || null, skillDirections, level: body.level || null, learningGoals, topics, itemsPerDigest, ...delivery },
    create: { userId: user.id, identity: body.identity || null, skillDirections, level: body.level || null, learningGoals, topics, itemsPerDigest, ...delivery },
  });
  return NextResponse.json({ ok: true });
}
