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
import { frozenDocuments, locateFrozenQuote } from "../lib/research-evidence.ts";

const now = new Date("2026-08-26T12:00:00.000Z");
function evidence(id: string, overrides: Partial<ResearchAgentEvidence> = {}): ResearchAgentEvidence {
  const quote = `证据 ${id}`;
  return { id, targetType: "EVENT", targetId: `target-${id}`, targetTitle: `对象 ${id}`, eventId: `event-${id}`, eventTitle: `事件 ${id}`, documentId: `doc-${id}`, documentTitle: `文档 ${id}`, sourceName: "测试来源", sourceUrl: `https://example.com/${id}`, quote, sourceKind: "ORIGINAL", sourceSnapshot: { analysisId: "analysis", revision: 1, contentHash: "hash", text: quote, quoteStart: 0, quoteEnd: quote.length }, stance: "SUPPORT", occurredAt: now.toISOString(), href: `/events/event-${id}`, ...overrides };
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
  const allowed = [evidence("ev-1"), evidence("ev-2")];
  const valid = { version: "research-agent-answer-v1", title: "报告", summary: "摘要", facts: [{ claim: "证据 ev-1", citations: ["ev-1"], kind: "FACT" }], limitations: [] };
  assert.equal(validateResearchAnswer(valid, allowed), true);
  assert.equal(validateResearchAnswer({ ...valid, facts: [{ claim: "无引用", citations: [], kind: "FACT" }] }, allowed), false);
  assert.equal(validateResearchAnswer({ ...valid, facts: [{ claim: "越界引用", citations: ["ev-9"], kind: "FACT" }] }, allowed), false);
});

test("rule fallback keeps citations and comparison subjects", () => {
  const answer = buildRuleBasedAnswer("比较", "COMPARE", ["A", "B"], [evidence("a", { targetId: "a", targetTitle: "A" }), evidence("b", { targetId: "b", targetTitle: "B" })]);
  assert.match(answer.title, /A与B/);
  assert.equal(answer.facts.length, 2);
  assert.equal(validateResearchAnswer(answer, [evidence("a"), evidence("b")]), true);
});

test("model output parser rejects malformed JSON and citations outside the snapshot", () => {
  assert.throws(() => parseResearchModelAnswer("not json", [evidence("ev-1")]), /invalid JSON/);
  const unsupported = JSON.stringify({ version: "research-agent-answer-v1", title: "模型报告", summary: "摘要", facts: [{ claim: "无依据事实", citations: ["unknown"], kind: "FACT" }], limitations: [] });
  assert.throws(() => parseResearchModelAnswer(unsupported, [evidence("ev-1")]), /invalid citations|unsupported claims/);
});

test("30-day boundaries are inclusive with no future grace and filtering precedes truncation", () => {
  const cutoff = now.getTime() - 30 * 86_400_000;
  const times = [cutoff - 1, cutoff, cutoff + 1, now.getTime() - 1, now.getTime(), now.getTime() + 1, now.getTime() + 12 * 3_600_000];
  const items = times.map((time, index) => evidence(`boundary-${index}`, { occurredAt: new Date(time).toISOString() }));
  assert.deepEqual(filterEvidenceForMode(items, "CHANGES_30D", now.getTime()).map((item) => item.id), ["boundary-1", "boundary-2", "boundary-3", "boundary-4"]);
  const old = Array.from({ length: 80 }, (_, index) => evidence(`old-${index}`, { targetId: "A", occurredAt: new Date(cutoff - 1).toISOString() }));
  assert.equal(normalizeEvidence(filterEvidenceForMode([...old, evidence("new", { targetId: "A" })], "CHANGES_30D", now.getTime()))[0].id, "new");
});

test("known IDs cannot endorse unrelated claims, free inference, wrong offsets or summaries", () => {
  const original = evidence("a");
  const answer = buildRuleBasedAnswer("问答", "QUESTION", ["A"], [original]);
  for (const claim of ["无关公司收购已经完成", `${original.quote}，因此市场必然上涨`]) {
    assert.equal(validateResearchAnswer({ ...answer, facts: [{ claim, citations: ["a"], kind: "FACT" }] }, [original]), false);
  }
  assert.equal(validateResearchAnswer({ ...answer, facts: [{ claim: original.quote, citations: ["a"], kind: "INFERENCE" }] }, [original]), false);
  const shifted = { ...original, sourceSnapshot: { ...original.sourceSnapshot!, quoteStart: 1 } };
  assert.equal(validateResearchAnswer(answer, [shifted]), false);
  assert.equal(validateResearchAnswer(answer, [{ ...original, sourceKind: "ANALYSIS_SUMMARY" }]), false);
});

test("conflicts and summaries never become facts and comparisons retain both stances", () => {
  const items = [evidence("a", { targetId: "A" }), evidence("b", { targetId: "A", stance: "CONFLICT" }), evidence("c", { targetId: "B", sourceKind: "ANALYSIS_SUMMARY" })];
  const answer = buildRuleBasedAnswer("比较", "COMPARE", ["A", "B"], items);
  assert.equal(answer.facts.length, 3);
  assert.equal(answer.facts.find((fact) => fact.citations.includes("b"))?.kind, "CONFLICT");
  assert.equal(answer.facts.find((fact) => fact.citations.includes("c"))?.kind, "CONTEXT");
  assert.equal(validateResearchAnswer(answer, items), true);
  assert.equal(normalizeEvidence([items[0], { ...items[0], id: "same-document-conflict", stance: "CONFLICT" }]).length, 2);
});

test("original excerpts must be located within a valid frozen material version", () => {
  const document = { id: "doc", revision: 2, contentHash: "hash", title: "标题", url: "https://example.com", source: "来源", publishedAt: now.toISOString(), content: "前文。可以定位的原文。后文。" };
  assert.equal(frozenDocuments([document, { ...document, revision: -1 }, { ...document, contentHash: null }]).length, 1);
  assert.equal(locateFrozenQuote("analysis", document, "完全无关的原文"), null);
  const located = locateFrozenQuote("analysis", document, "可以定位的原文");
  assert.equal(located?.sourceSnapshot?.quoteStart, 3);
  assert.equal(located?.sourceSnapshot?.text.slice(3, located.sourceSnapshot.quoteEnd), located?.quote);
  assert.equal(locateFrozenQuote("analysis", { ...document, content: "" }), null);
});
