import test from "node:test";
import assert from "node:assert/strict";
import { isAdminEmail, normalizeEntityName, remapEntityRelations, sortEntityTimeline } from "../lib/entity-policy.ts";

test("aliases normalize case and whitespace for deduplication", () => {
  assert.equal(normalizeEntityName("  OpenAI   API "), normalizeEntityName("openai api"));
});

test("entity merge removes self relations and keeps strongest duplicate", () => {
  const result = remapEntityRelations([
    { fromEntityId: "source", toEntityId: "target", relation: "COMPETES_WITH", confidence: 0.8 },
    { fromEntityId: "source", toEntityId: "other", relation: "REFERENCES", confidence: 0.4 },
    { fromEntityId: "target", toEntityId: "other", relation: "REFERENCES", confidence: 0.9 },
  ], "source", "target");
  assert.equal(result.length, 1);
  assert.equal(result[0].confidence, 0.9);
});

test("entity timeline is ordered newest first without mutating input", () => {
  const input = [{ id: "old", occurredAt: new Date("2025-01-01") }, { id: "new", occurredAt: new Date("2026-01-01") }];
  assert.deepEqual(sortEntityTimeline(input).map((item) => item.id), ["new", "old"]);
  assert.equal(input[0].id, "old");
});

test("entity merge authorization rejects missing and non-admin users", () => {
  process.env.ADMIN_EMAILS = "admin@example.com,owner@example.com";
  assert.equal(isAdminEmail("ADMIN@example.com"), true);
  assert.equal(isAdminEmail("reader@example.com"), false);
  assert.equal(isAdminEmail(null), false);
});
