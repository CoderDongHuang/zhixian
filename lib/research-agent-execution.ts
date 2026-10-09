import type { Prisma, ResearchAgentMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asEvidenceSnapshot, generateResearchAnswer } from "@/lib/research-agent";
import type { ResearchAgentModeValue } from "@/lib/research-agent-policy";
import { finishResearchAttempt } from "@/lib/research-agent-storage";

function outlineSubjects(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const subjects = (value as { subjects?: unknown }).subjects;
  return Array.isArray(subjects) ? subjects.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
}

export type ExecutableResearchTask = {
  id: string;
  question: string;
  mode: ResearchAgentMode;
  outline: Prisma.JsonValue;
  evidenceSnapshot: Prisma.JsonValue;
};

export async function completeResearchTask(task: ExecutableResearchTask, executionToken: string) {
  const evidence = asEvidenceSnapshot(task.evidenceSnapshot);
  const result = await generateResearchAnswer(task.question, task.mode as ResearchAgentModeValue, outlineSubjects(task.outline), evidence);
  const detail = result.fallbackReason ? `规则降级：${result.fallbackReason}` : result.modelVersion === "rules-v1" ? "规则模式完成" : `模型 ${result.modelVersion} 完成`;
  const saved = await finishResearchAttempt(prisma, task.id, executionToken, { answer: result.answer as unknown as Prisma.InputJsonValue, modelVersion: result.modelVersion, detail });
  return saved ? result : null;
}

export async function failResearchTask(taskId: string, executionToken: string) {
  return finishResearchAttempt(prisma, taskId, executionToken, null);
}
