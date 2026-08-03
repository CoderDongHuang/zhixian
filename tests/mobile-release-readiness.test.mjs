import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const command = ["scripts/check-mobile-release-readiness.mjs", "--build"];

test("release readiness reports missing secret names without values", () => {
  const result = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, EXPO_TOKEN: "" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing secret: EXPO_TOKEN/);
});

test("release readiness accepts a complete build environment", () => {
  const env = { ...process.env };
  for (const name of ["EXPO_TOKEN", "EXPO_PUBLIC_EAS_PROJECT_ID", "EXPO_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]) env[name] = "configured-for-test";
  const result = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"ready":true/);
});
