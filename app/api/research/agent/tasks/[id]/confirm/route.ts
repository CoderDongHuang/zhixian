import { randomUUID } from "node:crypto";
import { claimResearchAttempt } from "@/lib/research-agent-storage";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { completeResearchTask, failResearchTask } from "@/lib/research-agent-execution";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.researchAgentTask.findFirst({ where: { id, userId: user.id }, select: { id: true, question: true, mode: true, outline: true, evidenceSnapshot: true, status: true, updatedAt: true, executionToken: true } });
  if (!task) return Response.json({ error: "研究任务不存在" }, { status: 404 });
  if (task.status !== "AWAITING_CONFIRMATION") return Response.json({ error: "任务状态已变化，请刷新后重试" }, { status: 409 });
  const executionToken = randomUUID();
  const claimed = await claimResearchAttempt(prisma, task, executionToken);
  if (!claimed) return Response.json({ error: "任务正在执行或已处理" }, { status: 409 });
  try {
    const result = await completeResearchTask(task, executionToken);
    if (!result) return Response.json({ error: "执行已被新尝试替代，请刷新" }, { status: 409 });
    return Response.json({ ok: true, status: "COMPLETED", modelVersion: result.modelVersion });
  } catch {
    if (!await failResearchTask(id, executionToken)) return Response.json({ error: "执行已被新尝试替代，请刷新" }, { status: 409 });
    return Response.json({ error: "研究报告生成失败，可稍后重试" }, { status: 500 });
  }
}
