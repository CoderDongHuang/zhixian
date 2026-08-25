import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanOptionalText,
  cleanRequiredText,
  hashResearchShareToken,
  isResearchItemType,
  parseTimelineWindow,
  researchTargetHref,
} from "../lib/research-policy.ts";

test("research inputs are bounded and item types are allowlisted", () => {
  assert.equal(cleanRequiredText("  topic  ", 10), "topic");
  assert.equal(cleanRequiredText("123456", 4), "1234");
  assert.equal(cleanOptionalText("   ", 20), null);
  assert.equal(isResearchItemType("EVENT"), true);
  assert.equal(isResearchItemType("DOCUMENT"), false);
});

test("share tokens are hashed deterministically without retaining plaintext", () => {
  const token = "test-token-that-is-long-enough";
  const digest = hashResearchShareToken(token);
  assert.equal(digest.length, 64);
  assert.notEqual(digest, token);
  assert.equal(hashResearchShareToken(token), digest);
});

test("timeline windows and target links use canonical values", () => {
  assert.equal(parseTimelineWindow("7"), 7);
  assert.equal(parseTimelineWindow("90"), 90);
  assert.equal(parseTimelineWindow("365"), 30);
  assert.equal(researchTargetHref("ENTITY", "a/b"), "/entities/a%2Fb");
});
