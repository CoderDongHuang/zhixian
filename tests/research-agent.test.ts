import assert from "node:assert/strict";
import test from "node:test";
import {
  RESEARCH_AGENT_MAX_EVIDENCE,
  buildResearchOutline,
  buildRuleBasedAnswer,
  cleanResearchQuestion,
  filterEvidenceForMode,
  isResearchAgentMode,
  normalizeEvidence,
  parseResearchModelAnswer,
  researchAgentRefusal,
  validateResearchAnswer,
  type ResearchAgentEvidence,
} from "../lib/research-agent-policy.ts";

const now = new Date("2026-08-26T12:00:00.000Z");
function evidence(id: string, overrides: Partial<ResearchAgentEvidence> = {}): ResearchAgentEvidence {
  return { id, targetType: "EVENT", targetId: `target-${id}`, targetTitle: `对象 ${id}`, eventId: `event-${id}`, eventTitle: `事件 ${id}`, documentId: `doc-${id}`, documentTitle: `文档 ${id}`, sourceName: "测试来源", sourceUrl: `https://example.com/${id}`, quote: `证据 ${id}`, stance: "SUPPORT", occurredAt: now.toISOString(), href: `/events/event-${id}`, ...overrides };
}

test("research-agent input and mode allowlists are bounded", () => {
  assert.equal(isResearchAgentMode("COMPARE"), true);
  assert.equal(isResearchAgentMode("OPEN_WEB"), false);
  assert.equal(cleanResearchQuestion(`  ${"问".repeat(1200)}  `).length, 1000);
  assert.equal(cleanResearchQuestion({}), "");
});

test("30-day mode excludes old and future evidence", () => {
  const items = [evidence("current"), evidence("old", { occurredAt: "2026-07-20T00:00:00.000Z" }), evidence("future", { occurredAt: "2026-09-01T00:00:00.000Z" })];
  assert.deepEqual(filterEvidenceForMode(items, "CHANGES_30D", now.getTime()).map((item) => item.id), ["current"]);
  assert.equal(filterEvidenceForMode(items, "QUESTION", now.getTime()).length, 3);
});

test("evidence snapshots deduplicate per target and enforce size limits", () => {
  const duplicate = evidence("duplicate", { id: "duplicate-2" });
  const items = [evidence("duplicate"), duplicate, ...Array.from({ length: 50 }, (_, index) => evidence(`extra-${index}`))];
  const normalized = normalizeEvidence(items);
  assert.equal(normalized.length, RESEARCH_AGENT_MAX_EVIDENCE);
  assert.equal(normalized.filter((item) => item.targetId === "target-duplicate").length, 1);
  const balanced = normalizeEvidence([...Array.from({ length: 45 }, (_, index) => evidence(`a-${index}`, { targetId: "a" })), evidence("b", { targetId: "b" })]);
  assert.equal(balanced.some((item) => item.targetId === "b"), true);
});

test("comparison and empty evidence are refused explicitly", () => {
  assert.match(researchAgentRefusal("QUESTION", ["A"], []) || "", /没有可追溯/);
  assert.match(researchAgentRefusal("COMPARE", ["A"], [evidence("a")]) || "", /两个不同/);
  assert.match(researchAgentRefusal("COMPARE", ["A", "B"], [evidence("a")]) || "", /各自有证据/);
  assert.equal(researchAgentRefusal("COMPARE", ["A", "B"], [evidence("a"), evidence("b")]), null);
});

test("outline records subjects, evidence count, and mode-specific review", () => {
  const outline = buildResearchOutline("CHANGES_30D", ["A", "A", "B"], 3, now);
  assert.deepEqual(outline.subjects, ["A", "B"]);
  assert.equal(outline.evidenceCount, 3);
  assert.match(outline.steps[0].description, /30 天/);
});

test("every answer fact requires a citation from the frozen snapshot", () => {
  const allowed = ["ev-1", "ev-2"];
  const valid = { version: "research-agent-answer-v1", title: "报告", summary: "摘要", facts: [{ claim: "事实", citations: ["ev-1"], kind: "FACT" }], limitations: [] };
  assert.equal(validateResearchAnswer(valid, allowed), true);
  assert.equal(validateResearchAnswer({ ...valid, facts: [{ claim: "无引用", citations: [], kind: "FACT" }] }, allowed), false);
  assert.equal(validateResearchAnswer({ ...valid, facts: [{ claim: "越界引用", citations: ["ev-9"], kind: "FACT" }] }, allowed), false);
});

test("rule fallback keeps citations and comparison subjects", () => {
  const answer = buildRuleBasedAnswer("比较", "COMPARE", ["A", "B"], [evidence("a", { targetId: "a", targetTitle: "A" }), evidence("b", { targetId: "b", targetTitle: "B" })]);
  assert.match(answer.title, /A与B/);
  assert.equal(answer.facts.length, 2);
  assert.equal(validateResearchAnswer(answer, ["a", "b"]), true);
});

test("model output parser rejects malformed JSON and citations outside the snapshot", () => {
  assert.throws(() => parseResearchModelAnswer("not json", ["ev-1"]), /invalid JSON/);
  const unsupported = JSON.stringify({ version: "research-agent-answer-v1", title: "模型报告", summary: "摘要", facts: [{ claim: "无依据事实", citations: ["unknown"], kind: "FACT" }], limitations: [] });
  assert.throws(() => parseResearchModelAnswer(unsupported, ["ev-1"]), /invalid citations|unsupported claims/);
});
