import test from "node:test";
import assert from "node:assert/strict";
import { buildRuleLearningOutline, generateDailyTaskWithAi, generateLearningPathWithAi, type LearningContext, type ModelConfig } from "../lib/learning-ai.ts";
import { calculatePathProgress, calculateQualityScore, chooseAdaptiveTaskType, gradeLearningExercise, nextReviewSchedule, parseLearningExercise, parseLearningSubmission, publicLearningExercise, safeLearningModelConfig } from "../lib/learning-policy.ts";

const config: ModelConfig = { key: "test", url: "https://model.invalid", model: "test-model", timeoutMs: 10 };
const context: LearningContext = { identity: "开发者", level: "初级", skills: ["AI 应用"], goals: ["提升技能"], preferredTopics: ["大模型"], behaviorTopics: [{ topic: "大模型", score: 2 }], completedTasks: [], recentQuality: null, weakConcepts: [] };

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

test("learning exercise is strictly parsed, graded, and quality weighted", () => {
  const exercise = parseLearningExercise({ version: 1, instructions: "完成练习", deliverable: "提交产出", questions: [{ id: "q1", concept: "证据", prompt: "选择可信判断", kind: "single", options: ["有证据", "无证据"], correctAnswers: ["有证据"], explanation: "应引用证据" }, { id: "q2", concept: "影响", prompt: "选择影响", kind: "single", options: ["可验证", "不可验证"], correctAnswers: ["可验证"], explanation: "影响需验证" }] });
  assert.ok(exercise);
  const browserExercise = publicLearningExercise(exercise);
  assert.equal("correctAnswers" in browserExercise.questions[0], false); assert.equal("explanation" in browserExercise.questions[0], false);
  const submission = parseLearningSubmission({ answers: { q1: ["有证据"], q2: ["不可验证"] }, selfRating: 4, reflection: "我会继续检查原始来源、对照不同证据，并验证事件对实际决策的影响。", output: "这是一个明确超过三十个字符且可验证的实践产出内容，用于质量评分和边界验证。" });
  assert.ok(submission);
  const grade = gradeLearningExercise(exercise, submission);
  assert.equal(grade.score, 1); assert.deepEqual(grade.incorrectConcepts, ["影响"]);
  assert.equal(calculateQualityScore({ ...grade, ...submission, taskType: "PRACTICE" }), 63);
  assert.equal(calculatePathProgress([{ completedAt: new Date(), qualityScore: 90 }, { completedAt: new Date(), qualityScore: 50 }, { completedAt: null, qualityScore: null }]), 47);
});

test("adaptive task type and review spacing respond to quality", () => {
  assert.equal(chooseAdaptiveTaskType({ recentQuality: 92, developerTrack: true, completedCount: 3 }), "CODE");
  assert.equal(chooseAdaptiveTaskType({ recentQuality: 40, developerTrack: true, completedCount: 3 }), "PRACTICE");
  const wrong = nextReviewSchedule({ correct: false, repetition: 2, intervalDays: 7, easeFactor: 2.5 }, new Date("2026-08-27T00:00:00Z"));
  assert.equal(wrong.intervalDays, 1); assert.equal(wrong.repetition, 0);
  const correct = nextReviewSchedule({ correct: true, repetition: 0, intervalDays: 1, easeFactor: 2.5 }, new Date("2026-08-27T00:00:00Z"));
  assert.equal(correct.intervalDays, 3); assert.equal(correct.repetition, 1);
});

test("learning model configuration requires HTTPS and clamps timeout", () => {
  assert.equal(safeLearningModelConfig({ key: "k", url: "http://model.example", model: "m" }), null);
  assert.equal(safeLearningModelConfig({ key: "k", url: "not-a-url", model: "m" }), null);
  assert.equal(safeLearningModelConfig({ key: "k", url: "https://model.example", model: "m", timeoutMs: 1 })?.timeoutMs, 5000);
  assert.equal(safeLearningModelConfig({ key: "k", url: "https://model.example", model: "m", timeoutMs: 100000 })?.timeoutMs, 60000);
});
