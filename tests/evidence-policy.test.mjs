import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvidenceCandidates } from "../lib/evidence-policy.mjs";

test("evidence candidates preserve valid stances and bound untrusted fields", () => {
  assert.deepEqual(normalizeEvidenceCandidates([
    { quote: " supports claim ", stance: "support" },
    { quote: "conflicts with claim", stance: "CONFLICT" },
    { quote: "context only", stance: "invented" },
  ]), [
    { quote: "supports claim", stance: "SUPPORT" },
    { quote: "conflicts with claim", stance: "CONFLICT" },
    { quote: "context only", stance: "CONTEXT" },
  ]);
});

test("legacy quote arrays remain compatible and duplicates collapse", () => {
  assert.deepEqual(normalizeEvidenceCandidates([], ["quote", "quote", ""]), [{ quote: "quote", stance: "SUPPORT" }]);
});
