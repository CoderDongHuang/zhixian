import assert from "node:assert/strict";
import test from "node:test";
import { confidenceCap, publicationDecision } from "../scripts/analysis-policy.mjs";
import { bestTitleMatch, createClusterKey, titleSimilarity } from "../scripts/content-utils.mjs";
import { documentContentHash, githubMetrics, normalizeDocumentText } from "../scripts/ingest-policy.mjs";
import { evaluateJob } from "../scripts/job-policy.mjs";

test("batch policy fails all-failed, excessive failures, and required zero output", () => {
  assert.equal(evaluateJob({ total: 3, failed: 3 }, { output: 0 }).status, "FAILED");
  assert.equal(evaluateJob({ total: 10, failed: 3 }, { output: 7, failureRateThreshold: 0.2 }).status, "FAILED");
  assert.equal(evaluateJob({ total: 4, failed: 0 }, { output: 0, failOnZeroOutput: true }).status, "FAILED");
  assert.equal(evaluateJob({ total: 0, failed: 0 }, { output: 0, failOnEmptyInput: true }).status, "FAILED");
  assert.equal(evaluateJob({ total: 0, failed: 0 }, { output: 0, failOnZeroOutput: true }).status, "WARNING");
});

test("content hashes are based on normalized content and GitHub metrics are stable", () => {
  assert.equal(normalizeDocumentText("  <p>ＡI&nbsp; news</p>  "), "AI&nbsp; news");
  assert.equal(documentContentHash("Title", "<b>same</b> text"), documentContentHash("Title", "same text"));
  assert.notEqual(documentContentHash("Title", "first"), documentContentHash("Title", "second"));
  assert.deepEqual(githubMetrics({ stargazers_count: 12, forks_count: 3, subscribers_count: 2, open_issues_count: 1, updated_at: "2026-08-23", pushed_at: "2026-08-22" }), {
    stars: 12, forks: 3, watchers: 2, openIssues: 1, githubUpdatedAt: "2026-08-23", pushedAt: "2026-08-22",
  });
});

test("ordered-title clustering preserves direction while matching related titles", () => {
  const forward = "OpenAI acquires Windsurf";
  const reverse = "Windsurf acquires OpenAI";
  assert.notEqual(createClusterKey(forward), createClusterKey(reverse));
  assert.ok(titleSimilarity(forward, reverse) < 0.65);
  assert.equal(bestTitleMatch(forward, [{ id: "reverse", title: reverse }]), null);
  const related = bestTitleMatch("OpenAI launches GPT-6 model", [{ id: "same", title: "OpenAI releases new GPT-6 language model" }]);
  assert.equal(related?.event.id, "same");
});

test("trusted official single sources can publish while community-only items stay capped", () => {
  const official = [{ document: { content: "a located supporting quote", sourceId: "official", source: { type: "OFFICIAL_BLOG", trustScore: 0.95 } } }];
  const community = [{ document: { content: "a located supporting quote", sourceId: "community", source: { type: "HACKER_NEWS", trustScore: 0.9 } } }];
  const evidence = [{ quote: "a located supporting quote", stance: "SUPPORT" }];
  assert.deepEqual(confidenceCap(official), { cap: 0.9, reason: "trusted-single-source:OFFICIAL_BLOG" });
  assert.equal(publicationDecision(official, 0.84, [], evidence).publish, true);
  assert.equal(publicationDecision(official, 1, []).publish, false);
  assert.equal(publicationDecision(official, 1, [], [{ quote: "not located in the source", stance: "SUPPORT" }]).publish, false);
  assert.equal(publicationDecision(official, 1, [], [...evidence, { ...evidence[0], stance: "CONFLICT" }]).publish, false);
  assert.equal(publicationDecision(official, 0.84, ["unsupported"]).publish, false);
  assert.deepEqual(publicationDecision(community, 0.95, [], evidence), { confidence: 0.74, publish: false, reason: "unverified-single-source" });
});
