export const RESEARCH_AGENT_QUESTION_MAX = 1000;
export const RESEARCH_AGENT_MAX_EVIDENCE = 40;
export const RESEARCH_AGENT_EVIDENCE_TEXT_MAX = 700;
export const RESEARCH_AGENT_RETENTION_DAYS = 365;
export const RESEARCH_AGENT_TASKS_PER_HOUR = 20;

export const researchAgentModes = ["QUESTION", "COMPARE", "CHANGES_30D"] as const;
export type ResearchAgentModeValue = (typeof researchAgentModes)[number];

export type ResearchAgentEvidence = {
  id: string;
  targetType: "EVENT" | "ENTITY" | "DIGEST";
  targetId: string;
  targetTitle: string;
  eventId: string | null;
  eventTitle: string | null;
  documentId: string | null;
  documentTitle: string;
  sourceName: string;
  sourceUrl: string;
  quote: string;
  stance: "SUPPORT" | "CONFLICT" | "CONTEXT";
  occurredAt: string;
  href: string;
};

export type ResearchAgentOutline = {
  version: "research-agent-outline-v1";
  steps: { title: string; description: string }[];
  subjects: string[];
  evidenceCount: number;
  generatedAt: string;
};

export type ResearchAgentFact = {
  claim: string;
  citations: string[];
  kind: "FACT" | "INFERENCE";
};

export type ResearchAgentAnswer = {
  version: "research-agent-answer-v1";
  title: string;
  summary: string;
  facts: ResearchAgentFact[];
  limitations: string[];
};

export function isResearchAgentMode(value: unknown): value is ResearchAgentModeValue {
  return typeof value === "string" && researchAgentModes.includes(value as ResearchAgentModeValue);
}

export function cleanResearchQuestion(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, RESEARCH_AGENT_QUESTION_MAX) : "";
}

function compact(value: string, max = RESEARCH_AGENT_EVIDENCE_TEXT_MAX) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeEvidence(evidence: ResearchAgentEvidence[]) {
  const seen = new Set<string>();
  const unique = evidence.flatMap((item) => {
    const key = `${item.targetId}:${item.eventId || ""}:${item.documentId || ""}:${item.sourceUrl}`;
    if (seen.has(key) || !item.id || !item.occurredAt) return [];
    seen.add(key);
    return [{ ...item, documentTitle: compact(item.documentTitle, 240), sourceName: compact(item.sourceName, 120), quote: compact(item.quote), targetTitle: compact(item.targetTitle, 240), eventTitle: item.eventTitle ? compact(item.eventTitle, 240) : null }];
  });
  const grouped = new Map<string, ResearchAgentEvidence[]>();
  for (const item of unique) grouped.set(item.targetId, [...(grouped.get(item.targetId) || []), item]);
  const groups = [...grouped.values()];
  const balanced: ResearchAgentEvidence[] = [];
  for (let index = 0; balanced.length < RESEARCH_AGENT_MAX_EVIDENCE; index++) {
    let added = false;
    for (const group of groups) {
      if (group[index]) { balanced.push(group[index]); added = true; }
      if (balanced.length === RESEARCH_AGENT_MAX_EVIDENCE) break;
    }
    if (!added) break;
  }
  return balanced;
}

export function filterEvidenceForMode(evidence: ResearchAgentEvidence[], mode: ResearchAgentModeValue, now = Date.now()) {
  if (mode !== "CHANGES_30D") return evidence;
  const cutoff = now - 30 * 86_400_000;
  return evidence.filter((item) => {
    const occurredAt = Date.parse(item.occurredAt);
    return Number.isFinite(occurredAt) && occurredAt >= cutoff && occurredAt <= now + 86_400_000;
  });
}

export function buildResearchOutline(mode: ResearchAgentModeValue, subjects: string[], evidenceCount: number, now = new Date()) : ResearchAgentOutline {
  const scopedSubjects = [...new Set(subjects.map((item) => compact(item, 120)).filter(Boolean))].slice(0, 12);
  const modeStep = mode === "COMPARE"
    ? { title: "对照对象", description: "按相同维度并列证据，明确共同点、差异和材料缺口。" }
    : mode === "CHANGES_30D"
      ? { title: "限定时间窗", description: "只纳入过去 30 天内发生或发布的专题证据。" }
      : { title: "拆解问题", description: "围绕用户问题整理可被专题材料直接支持的事实。" };
  return {
    version: "research-agent-outline-v1",
    steps: [modeStep, { title: "核对证据", description: "逐条检查来源、事件和冲突立场，排除专题外材料。" }, { title: "形成报告", description: "每个事实绑定至少一条冻结证据，并单列局限与推测。" }],
    subjects: scopedSubjects,
    evidenceCount,
    generatedAt: now.toISOString(),
  };
}

export function researchAgentRefusal(mode: ResearchAgentModeValue, subjects: string[], evidence: ResearchAgentEvidence[]) {
  if (!evidence.length) return mode === "CHANGES_30D" ? "该专题在过去 30 天内没有可追溯证据，无法回答。" : "该专题没有可追溯的文档或事件证据，无法回答。";
  if (mode === "COMPARE" && (new Set(subjects.filter(Boolean)).size < 2 || new Set(evidence.map((item) => item.targetId)).size < 2)) return "比较任务至少需要专题中两个不同且各自有证据的对象。";
  return null;
}

export function validateResearchAnswer(value: unknown, allowedEvidenceIds: Iterable<string>): value is ResearchAgentAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as Partial<ResearchAgentAnswer>;
  if (answer.version !== "research-agent-answer-v1" || typeof answer.title !== "string" || !answer.title.trim() || answer.title.length > 160) return false;
  if (typeof answer.summary !== "string" || !answer.summary.trim() || answer.summary.length > 1200 || !Array.isArray(answer.facts) || answer.facts.length < 1 || answer.facts.length > 16) return false;
  if (!Array.isArray(answer.limitations) || answer.limitations.length > 8 || answer.limitations.some((item) => typeof item !== "string" || !item.trim() || item.length > 300)) return false;
  const allowed = new Set(allowedEvidenceIds);
  return answer.facts.every((fact) => fact && typeof fact.claim === "string" && fact.claim.trim().length > 0 && fact.claim.length <= 800
    && (fact.kind === "FACT" || fact.kind === "INFERENCE") && Array.isArray(fact.citations) && fact.citations.length > 0 && fact.citations.length <= 8
    && new Set(fact.citations).size === fact.citations.length && fact.citations.every((id) => typeof id === "string" && allowed.has(id)));
}

export function parseResearchModelAnswer(content: unknown, allowedEvidenceIds: Iterable<string>): ResearchAgentAnswer {
  if (typeof content !== "string") throw new Error("Research model returned empty content");
  let parsed: unknown;
  try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { throw new Error("Research model returned invalid JSON"); }
  if (!validateResearchAnswer(parsed, allowedEvidenceIds)) throw new Error("Research model returned unsupported claims or invalid citations");
  return parsed;
}

export function buildRuleBasedAnswer(question: string, mode: ResearchAgentModeValue, subjects: string[], evidence: ResearchAgentEvidence[]): ResearchAgentAnswer {
  const ordered = [...evidence].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const grouped = [...new Map(ordered.map((item) => [item.targetId, item])).values()];
  const selected = (mode === "COMPARE" ? grouped : ordered).slice(0, mode === "COMPARE" ? 8 : 10);
  const facts = selected.map((item) => ({
    claim: compact(`${item.eventTitle || item.targetTitle}：${item.quote || item.documentTitle}`, 800),
    citations: [item.id],
    kind: "FACT" as const,
  }));
  const title = mode === "COMPARE" ? `${subjects.slice(0, 2).join("与")}证据对照` : mode === "CHANGES_30D" ? "过去 30 天专题变化" : `专题证据回答：${compact(question, 80)}`;
  return {
    version: "research-agent-answer-v1",
    title,
    summary: `报告仅依据专题内冻结的 ${evidence.length} 条证据生成；以下事实均可回溯到对应文档或事件。`,
    facts,
    limitations: ["规则模式只整理可直接引用的材料，不补充专题外知识。", mode === "COMPARE" ? "不同对象的材料数量和发布时间可能不对称，不能据此推断完整市场表现。" : "材料覆盖范围由当前专题决定，未收录来源不代表没有相关变化。"],
  };
}
