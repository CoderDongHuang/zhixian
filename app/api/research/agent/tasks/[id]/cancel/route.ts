import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const cancelled = await prisma.$transaction(async (tx) => {
    const result = await tx.researchAgentTask.updateMany({ where: { id, userId: user.id, status: "AWAITING_CONFIRMATION" }, data: { status: "CANCELLED", completedAt: new Date() } });
    if (result.count) await tx.researchAgentEvent.create({ data: { taskId: id, status: "CANCELLED", detail: "用户在报告生成前取消任务" } });
    return result.count;
  });
  if (!cancelled) {
    const exists = await prisma.researchAgentTask.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    return Response.json({ error: exists ? "只有等待确认的任务可以取消" : "研究任务不存在" }, { status: exists ? 409 : 404 });
  }
  return Response.json({ ok: true });
}
