import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { completeResearchTask, failResearchTask } from "@/lib/research-agent-execution";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.researchAgentTask.findFirst({ where: { id, userId: user.id }, select: { id: true, question: true, mode: true, outline: true, evidenceSnapshot: true, status: true, updatedAt: true } });
  if (!task) return Response.json({ error: "研究任务不存在" }, { status: 404 });
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  const retryable = task.status === "FAILED" || (task.status === "RUNNING" && task.updatedAt < staleBefore);
  if (!retryable) return Response.json({ error: "只有失败或长时间未完成的任务可以重试" }, { status: 409 });
  const claimed = await prisma.$transaction(async (tx) => {
    const result = await tx.researchAgentTask.updateMany({ where: { id, userId: user.id, OR: [{ status: "FAILED" }, { status: "RUNNING", updatedAt: { lt: staleBefore } }] }, data: { status: "RUNNING", error: null, completedAt: null } });
    if (result.count) await tx.researchAgentEvent.create({ data: { taskId: id, status: "RUNNING", detail: "用户使用原冻结证据重试任务" } });
    return result.count;
  });
  if (!claimed) return Response.json({ error: "任务正在执行或已处理" }, { status: 409 });
  try {
    const result = await completeResearchTask(task);
    return Response.json({ ok: true, status: "COMPLETED", modelVersion: result.modelVersion });
  } catch {
    await failResearchTask(id);
    return Response.json({ error: "研究报告生成失败，可稍后重试" }, { status: 500 });
  }
}
