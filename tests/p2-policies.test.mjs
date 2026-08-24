import assert from "node:assert/strict";
import test from "node:test";
import { configuredEmbeddingDimensions, validEmbeddingVector } from "../lib/embedding-policy.mjs";
import { issueUnsubscribeToken, verifyUnsubscribeToken } from "../lib/unsubscribe-token.mjs";
import { evaluateMonitorSamples, percentile95 } from "../scripts/monitor-policy.mjs";
import { RETENTION_DAYS, retentionCutoff } from "../scripts/retention-policy.mjs";

test("unsubscribe tokens expire, bind their purpose and support key rotation", () => {
  process.env.AUTH_SECRET = "current-test-secret-at-least-24-characters";
  const issuedAt = Date.UTC(2026, 7, 24);
  const token = issueUnsubscribeToken("user-1", issuedAt, 60_000);
  assert.equal(verifyUnsubscribeToken(token, "user-1", issuedAt + 30_000)?.sub, "user-1");
  assert.equal(verifyUnsubscribeToken(token, "user-2", issuedAt + 30_000), null);
  assert.equal(verifyUnsubscribeToken(token, "user-1", issuedAt + 60_000), null);
  assert.equal(verifyUnsubscribeToken(`${token.slice(0, -1)}x`, "user-1", issuedAt + 1), null);
  process.env.UNSUBSCRIBE_TOKEN_PREVIOUS_SECRET = process.env.AUTH_SECRET;
  process.env.UNSUBSCRIBE_TOKEN_SECRET = "rotated-test-secret-at-least-24-characters";
  assert.equal(verifyUnsubscribeToken(token, "user-1", issuedAt + 30_000)?.sub, "user-1");
  delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
  delete process.env.UNSUBSCRIBE_TOKEN_PREVIOUS_SECRET;
});

test("embedding configuration must match vector(1024) and rejects malformed vectors", () => {
  assert.equal(configuredEmbeddingDimensions(), 1024);
  assert.throws(() => configuredEmbeddingDimensions("1536"), /must be 1024/);
  assert.equal(validEmbeddingVector(Array(1024).fill(0.1)), true);
  assert.equal(validEmbeddingVector(Array(1023).fill(0.1)), false);
  assert.equal(validEmbeddingVector([...Array(1023).fill(0.1), Number.NaN]), false);
});

test("monitor separates sustained outage from cold-start and performance degradation", () => {
  assert.equal(percentile95([100, 300, 200]), 300);
  const coldStart = evaluateMonitorSamples([{ available: true, elapsedMs: 9000 }, { available: true, elapsedMs: 1000 }, { available: true, elapsedMs: 1200 }], 5000);
  assert.equal(coldStart.status, "healthy");
  const degraded = evaluateMonitorSamples([{ available: true, elapsedMs: 9000 }, { available: true, elapsedMs: 6000 }, { available: true, elapsedMs: 7000 }], 5000);
  assert.equal(degraded.status, "degraded");
  const outage = evaluateMonitorSamples([{ available: true, elapsedMs: 500 }, { available: false, elapsedMs: 12000 }, { available: false, elapsedMs: 12000 }], 5000);
  assert.equal(outage.status, "unavailable");
});

test("retention policies are positive and produce deterministic cutoffs", () => {
  assert.ok(Object.values(RETENTION_DAYS).every((days) => days > 0));
  assert.equal(retentionCutoff(7, Date.UTC(2026, 7, 24)).toISOString(), "2026-08-17T00:00:00.000Z");
});
