import Ajv, { type JSONSchemaType } from "ajv";

export type LearningContext = {
  identity: string;
  level: string;
  skills: string[];
  goals: string[];
  preferredTopics: string[];
  behaviorTopics: { topic: string; score: number }[];
  completedTasks: string[];
};

export type LearningOutlineItem = { phase: string; objective: string; weeks: number; topics: string[] };
export type AiLearningPath = { title: string; goal: string; topics: string[]; outline: LearningOutlineItem[]; reason: string };
export type DailyCandidate = { eventId: string; topic: string; title: string; learnerAdvice: string | null };
export type AiDailyTask = { title: string; description: string; reason: string; estimatedMinutes: number; eventId: string };
export type ModelConfig = { key: string; url: string; model: string; timeoutMs?: number };

export const LEARNING_PATH_PROMPT_VERSION = "learning-path-v1";
export const DAILY_TASK_PROMPT_VERSION = "daily-task-v1";

export function buildRuleLearningOutline(level: string, skills: string[], goals: string[]): LearningOutlineItem[] {
  const direction = skills[0] || "AI 应用";
  const goal = goals[0] || "提升技能";
  return [
    { phase: "建立地图", objective: `理解 ${direction} 的核心概念与行业位置`, weeks: 1, topics: ["基础概念", "关键参与者", "技术脉络"] },
    { phase: "形成能力", objective: `围绕“${goal}”完成可验证的实践`, weeks: level === "入门" ? 3 : 2, topics: ["工具链", "案例拆解", "动手实践"] },
    { phase: "持续进阶", objective: "跟踪重要变化并形成自己的判断", weeks: 2, topics: ["前沿进展", "方案比较", "复盘输出"] },
  ];
}

const outlineSchema: JSONSchemaType<LearningOutlineItem> = {
  type: "object", additionalProperties: false, required: ["phase", "objective", "weeks", "topics"],
  properties: {
    phase: { type: "string", minLength: 2, maxLength: 40 },
    objective: { type: "string", minLength: 5, maxLength: 240 },
    weeks: { type: "integer", minimum: 1, maximum: 8 },
    topics: { type: "array", minItems: 2, maxItems: 6, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 50 } },
  },
};

export const learningPathSchema: JSONSchemaType<AiLearningPath> = {
  type: "object", additionalProperties: false, required: ["title", "goal", "topics", "outline", "reason"],
  properties: {
    title: { type: "string", minLength: 4, maxLength: 80 },
    goal: { type: "string", minLength: 2, maxLength: 120 },
    topics: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 50 } },
    outline: { type: "array", minItems: 3, maxItems: 6, items: outlineSchema },
    reason: { type: "string", minLength: 5, maxLength: 300 },
  },
};

export const dailyTaskSchema: JSONSchemaType<AiDailyTask> = {
  type: "object", additionalProperties: false, required: ["title", "description", "reason", "estimatedMinutes", "eventId"],
  properties: {
    title: { type: "string", minLength: 4, maxLength: 120 },
    description: { type: "string", minLength: 8, maxLength: 500 },
    reason: { type: "string", minLength: 5, maxLength: 240 },
    estimatedMinutes: { type: "integer", minimum: 5, maximum: 60 },
    eventId: { type: "string", minLength: 0, maxLength: 100 },
  },
};

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

async function requestJson<T>(config: ModelConfig, schema: JSONSchemaType<T>, system: string, user: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  const schemaInstruction = `${system}\nReturn exactly one JSON object matching this JSON Schema. Do not add Markdown or commentary:\n${JSON.stringify(schema)}`;
  const response = await fetchImpl(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "system", content: schemaInstruction }, { role: "user", content: JSON.stringify(user) }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1800,
    }),
    signal: AbortSignal.timeout(config.timeoutMs ?? 30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Learning model returned HTTP ${response.status}`);
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Learning model returned empty content");
  let parsed: unknown;
  try { parsed = JSON.parse(stripCodeFence(content)); } catch { throw new Error("Learning model returned invalid JSON"); }
  const validate = new Ajv({ allErrors: true }).compile(schema);
  if (!validate(parsed)) throw new Error(`Learning model schema validation failed: ${validate.errors?.[0]?.message || "invalid result"}`);
  return parsed as T;
}

export function generateLearningPathWithAi(context: LearningContext, config: ModelConfig, fetchImpl?: typeof fetch) {
  return requestJson(config, learningPathSchema, "你是严谨的中文 AI 学习规划师。只输出符合约定结构的 JSON。路线必须可执行、阶段递进，不编造用户经历。", context, fetchImpl);
}

export async function generateDailyTaskWithAi(context: LearningContext & { path: AiLearningPath; candidates: DailyCandidate[]; recentEventIds: string[] }, config: ModelConfig, fetchImpl?: typeof fetch) {
  const result = await requestJson(config, dailyTaskSchema, "你是中文 AI 学习教练。只输出 JSON。优先从候选内容选择一个未在 recentEventIds 中出现的 eventId；没有合适内容时 eventId 为空字符串。任务必须在 5-60 分钟内完成。", context, fetchImpl);
  if (result.eventId && !context.candidates.some((candidate) => candidate.eventId === result.eventId)) throw new Error("Learning model selected an unknown event");
  return result;
}
