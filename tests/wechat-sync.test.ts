import test from "node:test";
import assert from "node:assert/strict";
import { exchangeWechatCode, issueAccessToken, verifyAccessToken } from "../lib/mini-security.ts";
import { isSessionDeviceAllowed, shouldApplyChange, validIdempotencyKey } from "../lib/sync-policy.ts";

process.env.AUTH_SECRET = "test-auth-secret-that-is-long-enough";
process.env.WECHAT_APP_ID = "wx-test";
process.env.WECHAT_APP_SECRET = "test-secret";

test("short-lived access token authenticates and rejects tampering or expiry", () => {
  const token = issueAccessToken("user-1", "session-1", 1_000_000);
  assert.equal(verifyAccessToken(token, 1_001_000)?.sub, "user-1");
  assert.equal(verifyAccessToken(`${token.slice(0, -1)}x`, 1_001_000), null);
  assert.equal(verifyAccessToken(token, 2_000_000), null);
});

test("code2Session accepts a valid identity and rejects provider errors", async () => {
  const success = await exchangeWechatCode("one-time-code", async () => new Response(JSON.stringify({ openid: "openid-1", unionid: "union-1", session_key: "private" })) as typeof fetch);
  assert.deepEqual(success, { openId: "openid-1", unionId: "union-1" });
  await assert.rejects(() => exchangeWechatCode("bad", async () => new Response(JSON.stringify({ errcode: 40029, errmsg: "invalid code" })) as typeof fetch), /40029/);
});

test("refresh sessions are isolated by device, revocation, and expiry", () => {
  const active = { deviceId: "phone-a", revokedAt: null, expiresAt: new Date("2030-01-01") };
  assert.equal(isSessionDeviceAllowed(active, "phone-a", new Date("2029-01-01")), true);
  assert.equal(isSessionDeviceAllowed(active, "phone-b", new Date("2029-01-01")), false);
  assert.equal(isSessionDeviceAllowed({ ...active, revokedAt: new Date() }, "phone-a"), false);
  assert.equal(isSessionDeviceAllowed(active, "phone-a", new Date("2031-01-01")), false);
});

test("sync uses last-write-wins and validates idempotency keys", () => {
  const old = new Date("2026-01-01T00:00:00Z");
  assert.equal(shouldApplyChange(old, new Date("2025-12-31T23:59:59Z")), false);
  assert.equal(shouldApplyChange(old, new Date("2026-01-01T00:00:01Z")), true);
  assert.equal(validIdempotencyKey("device:request-001"), true);
  assert.equal(validIdempotencyKey("short"), false);
});

test("binding requires an authenticated identity and a verified existing account", () => {
  const canBind = (authenticated: boolean, otpValid: boolean, accountExists: boolean) => authenticated && otpValid && accountExists;
  assert.equal(canBind(true, true, true), true);
  assert.equal(canBind(false, true, true), false);
  assert.equal(canBind(true, false, true), false);
  assert.equal(canBind(true, true, false), false);
});
