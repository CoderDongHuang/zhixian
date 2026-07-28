import test from "node:test";
import assert from "node:assert/strict";
import { classifyPushError, nextRetryAt, processClaimedPush } from "../lib/push-delivery.mjs";

test("successful delivery is marked once", async () => {
  const calls = [];
  const outcome = await processClaimedPush({
    retryCount: 1,
    send: async () => ({ headers: { location: "provider-1" } }),
    markSent: async (value) => calls.push(["sent", value]),
    markFailed: async () => calls.push(["failed"]),
    markExpired: async () => calls.push(["expired"]),
    invalidateDevice: async () => calls.push(["invalidate"]),
  });
  assert.equal(outcome, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "sent");
  assert.equal(calls[0][1].providerId, "provider-1");
});

test("temporary failures are scheduled with bounded backoff", async () => {
  const now = new Date("2026-07-28T00:00:00Z");
  let failure;
  const outcome = await processClaimedPush({
    retryCount: 2, now,
    send: async () => { throw new Error("timeout"); },
    markSent: async () => assert.fail("must not mark sent"),
    markFailed: async (value) => { failure = value; },
    markExpired: async () => assert.fail("must not expire"),
    invalidateDevice: async () => assert.fail("must not invalidate"),
  });
  assert.equal(outcome, "failed");
  assert.equal(failure.nextAttemptAt.toISOString(), "2026-07-28T00:15:00.000Z");
  assert.equal(nextRetryAt(20, now).toISOString(), "2026-07-28T03:00:00.000Z");
});

test("404 and 410 expire and remove subscriptions", async () => {
  for (const statusCode of [404, 410]) {
    const calls = [];
    const outcome = await processClaimedPush({
      retryCount: 1,
      send: async () => { throw Object.assign(new Error("gone"), { statusCode }); },
      markSent: async () => calls.push("sent"),
      markFailed: async () => calls.push("failed"),
      markExpired: async () => calls.push("expired"),
      invalidateDevice: async () => calls.push("invalidate"),
    });
    assert.equal(outcome, "expired");
    assert.deepEqual(calls, ["expired", "invalidate"]);
    assert.equal(classifyPushError({ statusCode }), "expired");
  }
});

test("a failed claim prevents duplicate sends", async () => {
  let sends = 0;
  async function execute(claimed) {
    if (!claimed) return "skipped";
    return processClaimedPush({ retryCount: 1, send: async () => { sends++; }, markSent: async () => {}, markFailed: async () => {}, markExpired: async () => {}, invalidateDevice: async () => {} });
  }
  assert.equal(await execute(true), "sent");
  assert.equal(await execute(false), "skipped");
  assert.equal(sends, 1);
});
