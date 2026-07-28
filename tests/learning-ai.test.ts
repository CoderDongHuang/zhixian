import test from "node:test";
import assert from "node:assert/strict";
import { buildRuleLearningOutline, generateDailyTaskWithAi, generateLearningPathWithAi, type LearningContext, type ModelConfig } from "../lib/learning-ai.ts";

const config: ModelConfig = { key: "test", url: "https://model.invalid", model: "test-model", timeoutMs: 10 };
const context: LearningContext = { identity: "开发者", level: "初级", skills: ["AI 应用"], goals: ["提升技能"], preferredTopics: ["大模型"], behaviorTopics: [{ topic: "大模型", score: 2 }], completedTasks: [] };

function modelResponse(value: unknown) {
  return async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("valid AI learning path passes schema validation", async () => {
  const result = await generateLearningPathWithAi(context, config, modelResponse({
    title: "AI 应用实践路线", goal: "独立完成一个 AI 应用", topics: ["AI 应用", "大模型"], reason: "结合开发者身份和近期大模型阅读行为",
    outline: [
      { phase: "基础", objective: "掌握模型调用与提示词基础", weeks: 1, topics: ["API", "提示词"] },
      { phase: "实践", objective: "完成一个具有评估闭环的应用", weeks: 2, topics: ["RAG", "评估"] },
      { phase: "迭代", objective: "根据用户反馈优化可靠性", weeks: 1, topics: ["监控", "优化"] },
    ],
  }) as typeof fetch);
  assert.equal(result.outline.length, 3);
  assert.equal(result.title, "AI 应用实践路线");
});

test("invalid AI structure is rejected and rule fallback remains available", async () => {
  await assert.rejects(() => generateLearningPathWithAi(context, config, modelResponse({ title: "缺少字段" }) as typeof fetch), /schema validation failed/);
  const fallback = buildRuleLearningOutline(context.level, context.skills, context.goals);
  assert.equal(fallback.length, 3);
  assert.ok(fallback.every((phase) => phase.topics.length >= 2));
});

test("daily task rejects an event outside candidates", async () => {
  const path = { title: "路线", goal: "提升技能", topics: ["AI 应用"], reason: "测试路线", outline: buildRuleLearningOutline("初级", ["AI 应用"], ["提升技能"]) };
  await assert.rejects(() => generateDailyTaskWithAi({ ...context, path, candidates: [{ eventId: "allowed", topic: "AI 行业", title: "候选内容", learnerAdvice: null }], recentEventIds: [] }, config, modelResponse({ title: "精读最新事件", description: "阅读内容并记录三个关键结论", reason: "与当前路线相关且近期未学习", estimatedMinutes: 15, eventId: "unknown" }) as typeof fetch), /unknown event/);
});

test("model timeout propagates so caller can use fallback", async () => {
  const timeoutFetch = async () => { throw new DOMException("timed out", "AbortError"); };
  await assert.rejects(() => generateLearningPathWithAi(context, config, timeoutFetch as typeof fetch), /timed out/);
});
