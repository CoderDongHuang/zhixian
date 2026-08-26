import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { collectResearchEvidence } from "@/lib/research-agent";
import { cleanResearchQuestion, isResearchAgentMode, RESEARCH_AGENT_TASKS_PER_HOUR } from "@/lib/research-agent-policy";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const tasks = await prisma.researchAgentTask.findMany({ where: { userId: user.id }, select: { id: true, question: true, mode: true, status: true, refusalReason: true, modelVersion: true, createdAt: true, updatedAt: true, collection: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return Response.json({ tasks });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const question = cleanResearchQuestion(body?.question);
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim().slice(0, 200) : "";
  if (!question) return Response.json({ error: "请输入研究问题" }, { status: 400 });
  if (!collectionId || !isResearchAgentMode(body?.mode)) return Response.json({ error: "请选择有效的专题和研究模式" }, { status: 400 });
  const targetKeys = Array.isArray(body?.targetKeys) ? body.targetKeys.filter((item: unknown): item is string => typeof item === "string").map((item: string) => item.trim().slice(0, 240)) : [];
  if (body.mode === "COMPARE" && (targetKeys.length !== 2 || new Set(targetKeys).size !== 2)) return Response.json({ error: "请选择两个不同的比较对象" }, { status: 400 });
  const recentTasks = await prisma.researchAgentTask.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recentTasks >= RESEARCH_AGENT_TASKS_PER_HOUR) return Response.json({ error: "研究任务创建过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": "3600" } });
  const prepared = await collectResearchEvidence(user.id, collectionId, body.mode, body.mode === "COMPARE" ? targetKeys : []);
  if (!prepared) return Response.json({ error: "专题不存在" }, { status: 404 });
  const status = prepared.refusalReason ? "REFUSED" : "AWAITING_CONFIRMATION";
  const task = await prisma.researchAgentTask.create({
    data: {
      userId: user.id,
      collectionId,
      question,
      mode: body.mode,
      status,
      outline: prepared.outline as unknown as Prisma.InputJsonValue,
      evidenceSnapshot: prepared.evidence as unknown as Prisma.InputJsonValue,
      refusalReason: prepared.refusalReason,
      completedAt: prepared.refusalReason ? new Date() : null,
      events: { create: { status, detail: prepared.refusalReason || `已冻结 ${prepared.evidence.length} 条专题证据，等待确认` } },
    },
    select: { id: true, status: true, refusalReason: true },
  });
  return Response.json({ ok: true, task }, { status: 201 });
}
