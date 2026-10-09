import type { Prisma, PrismaClient, ResearchAgentStatus } from "@prisma/client";

type Attempt = { id: string; status: ResearchAgentStatus; updatedAt: Date; executionToken: string | null };

export async function claimResearchAttempt(db: PrismaClient, task: Attempt, token: string, retry = false) {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  if (retry ? !(task.status === "FAILED" || (task.status === "RUNNING" && task.updatedAt < staleBefore)) : task.status !== "AWAITING_CONFIRMATION") return false;
  return db.$transaction(async (tx) => {
    const result = await tx.researchAgentTask.updateMany({
      where: { id: task.id, status: task.status, updatedAt: task.updatedAt, executionToken: task.executionToken },
      data: { status: "RUNNING", executionToken: token, error: null, completedAt: null, ...(!retry ? { confirmedAt: new Date() } : {}) },
    });
    if (result.count) await tx.researchAgentEvent.create({ data: { taskId: task.id, status: "RUNNING", detail: retry ? "用户使用原冻结证据重试任务" : "用户已确认大纲和冻结证据" } });
    return result.count === 1;
  });
}

export async function finishResearchAttempt(db: PrismaClient, id: string, token: string, result: { answer: Prisma.InputJsonValue; modelVersion: string; detail: string } | null) {
  return db.$transaction(async (tx) => {
    const message = "任务执行异常，请使用原冻结证据重试";
    const status = result ? "COMPLETED" : "FAILED";
    const changed = await tx.researchAgentTask.updateMany({
      where: { id, status: "RUNNING", executionToken: token },
      data: result
        ? { status, answer: result.answer, modelVersion: result.modelVersion, error: null, completedAt: new Date() }
        : { status, error: message, completedAt: new Date() },
    });
    if (changed.count) await tx.researchAgentEvent.create({ data: { taskId: id, status, detail: result ? result.detail.slice(0, 500) : message } });
    return changed.count === 1;
  });
}
