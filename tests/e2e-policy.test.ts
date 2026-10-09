import assert from "node:assert/strict";
import test from "node:test";
import { e2eSettings } from "../lib/e2e-policy.ts";

const valid = { E2E_TEST_MODE: "true", E2E_TEST_SECRET: "local-secret", DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/zhixian_e2e", APP_URL: "http://127.0.0.1:3100", NODE_ENV: "production" };
test("local production build can test only an explicitly isolated database", () => { assert.equal(e2eSettings(valid)?.database, "zhixian_e2e"); });
test("production deployment, remote hosts, business databases and missing secrets fail closed", () => {
  for (const override of [{ VERCEL_ENV: "production" }, { APP_ENV: "production" }, { E2E_TEST_MODE: "false" }, { E2E_TEST_SECRET: "" }, { DATABASE_URL: "postgresql://a:b@127.0.0.1:5432/zhixian" }, { DATABASE_URL: "postgresql://a:b@db.example.com:5432/zhixian_e2e" }, { APP_URL: "https://zhixian.asia" }, { DATABASE_URL: "invalid" }]) assert.equal(e2eSettings({ ...valid, ...override }), null);
});
