import assert from "node:assert/strict";
import test from "node:test";
import { createECDH, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";
import { configurationPreflight, inspectDatabase, migrationChecksums, preflightReport } from "../lib/configuration-preflight.mjs";

const validEnv = () => ({ DATABASE_URL: "postgresql://user:private-password@127.0.0.1:55439/zhixian_fixes_test", DIRECT_URL: "postgresql://user:private-password@127.0.0.1:55439/zhixian_fixes_test", APP_URL: "http://127.0.0.1:3100", AUTH_SECRET: randomBytes(32).toString("hex"), MONITOR_TOKEN: randomBytes(32).toString("hex"), CONTENT_PIPELINE_STATE: "paused", AI_BUDGET_ENFORCE: "false" });
const check = (env, id, production = false) => configurationPreflight(env, { production }).find((item) => item.id === id);
const script = fileURLToPath(new URL("../scripts/check-configuration.mjs", import.meta.url));
const runCli = (args, env, cwd = process.cwd()) => new Promise((resolve, reject) => {
  // No inherited business credentials; keep only OS variables needed to run Node.
  const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:path|systemroot|windir|temp|tmp|home|userprofile|pathext)$/i.test(key)));
  const child = spawn(process.execPath, [script, ...args], { env: { ...base, ...env }, cwd });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr }));
});

test("preflight distinguishes checks from release acceptance and never prints supplied values", () => {
  const env = validEnv(), checks = configurationPreflight(env), report = preflightReport(checks, false);
  assert.equal(report.status, "CHECKS_PASSED"); assert.equal(report.releaseReady, false);
  assert.ok(report.pendingAcceptance.includes("DATABASE_BACKUP_RESTORE_AND_FULL_SCHEMA_DRIFT"));
  assert.equal(check(env, "CONTENT_PIPELINE_STATE").code, "INTENTIONALLY_PAUSED");
  for (const value of [env.AUTH_SECRET, env.MONITOR_TOKEN, env.DATABASE_URL, "private-password"]) assert.equal(JSON.stringify(report).includes(value), false);
});

test("production rejects test credentials, unsafe origins, placeholders and transaction migration poolers", () => {
  const env = { ...validEnv(), APP_URL: "https://zhixian.asia", EMAIL_API_KEY: "private-mail-key", EMAIL_FROM: "login@zhixian.asia", UNSUBSCRIBE_TOKEN_SECRET: randomBytes(32).toString("hex") };
  assert.equal(preflightReport(configurationPreflight(env, { production: true }), true).status, "CHECKS_PASSED");
  for (const overrides of [{ AUTH_SECRET: "replace-with-a-long-random-secret" }, { AUTH_SECRET: "e2e-auth-secret-at-least-24-characters" }, { APP_URL: "http://zhixian.asia" }, { APP_URL: "https://user:private@zhixian.asia" }, { APP_URL: "https://zhixian.asia?key=private" }, { E2E_TEST_MODE: "true" }, { E2E_TEST_SECRET: "private-test-secret" }, { DATABASE_URL: "postgresql://user:password@db.example.supabase.co:5432/postgres" }, { DIRECT_URL: "postgresql://user:private@aws-0.pooler.supabase.com:6543/postgres" }, { EMAIL_API_KEY: "" }]) assert.equal(preflightReport(configurationPreflight({ ...env, ...overrides }, { production: true }), true).status, "BLOCKED");
});

test("partial model configuration and effective learning fallbacks are diagnosed", () => {
  const env = validEnv();
  assert.equal(check(env, "RESEARCH_AI").status, "DISABLED");
  for (const config of [{ RESEARCH_AI_API_URL: "https://api.provider.invalid" }, { RESEARCH_AI_API_KEY: "private" }, { RESEARCH_AI_API_KEY: "private", RESEARCH_AI_API_URL: "file:///secret", RESEARCH_AI_MODEL: "private-model" }]) assert.equal(check({ ...env, ...config }, "RESEARCH_AI").status, "ERROR");
  assert.equal(check({ ...env, EMBEDDING_API_URL: "https://provider.invalid/embeddings", EMBEDDING_MODEL: "default" }, "EMBEDDING").status, "DISABLED");
  assert.equal(check({ ...env, AI_API_KEY: "private", AI_API_URL: "https://provider.invalid", AI_MODEL: "private-model", LEARNING_AI_MODEL: "custom" }, "LEARNING_AI_EFFECTIVE").status, "PASS");
  assert.equal(check({ ...env, AI_API_KEY: "private", AI_API_URL: "http://127.0.0.1:3199", AI_MODEL: "private-model" }, "LEARNING_AI_EFFECTIVE").status, "ERROR");
});

test("paid models require a policy and provider/model prices without echoing them", () => {
  const env = { ...validEnv(), RESEARCH_AI_API_KEY: "private-key", RESEARCH_AI_API_URL: "https://provider.invalid/v1/chat", RESEARCH_AI_MODEL: "private-model" };
  assert.equal(check(env, "AI_BUDGET").status, "ERROR");
  env.AI_BUDGET_JSON = JSON.stringify({ dailyLimitUsd: "1.00", reservationUsd: "0.10", maxCallsPerDay: 10, maxInputBytes: 10000, maxOutputTokens: 1000 });
  assert.equal(check(env, "RESEARCH_AI_PRICE").status, "ERROR");
  env.AI_PRICING_JSON = JSON.stringify({ "provider.invalid/private-model": { version: "v1", inputPerMillion: 1, outputPerMillion: 2 } });
  assert.equal(check(env, "RESEARCH_AI_PRICE").status, "PASS");
  for (const value of ["private-key", "provider.invalid", "private-model"]) assert.equal(JSON.stringify(configurationPreflight(env)).includes(value), false);
});

test("VAPID validates matching curve keys rather than accepting non-empty strings", () => {
  const ecdh = createECDH("prime256v1"), publicKey = ecdh.generateKeys().toString("base64url");
  const env = { ...validEnv(), VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString("base64url"), VAPID_SUBJECT: "mailto:admin@zhixian.asia" };
  assert.equal(check(env, "WEB_PUSH").status, "PASS");
  const other = createECDH("prime256v1"); other.generateKeys();
  for (const overrides of [{ VAPID_PUBLIC_KEY: "short-key" }, { VAPID_PRIVATE_KEY: other.getPrivateKey().toString("base64url") }, { VAPID_SUBJECT: "file:///private" }]) assert.equal(check({ ...env, ...overrides }, "WEB_PUSH").status, "ERROR");
  assert.equal(JSON.stringify(configurationPreflight(env)).includes(env.VAPID_PRIVATE_KEY), false);
});

test("vector schema dimensions and partial WeChat credentials fail closed", () => {
  const env = validEnv();
  assert.equal(check({ ...env, EMBEDDING_DIMENSIONS: "1536" }, "EMBEDDING_DIMENSIONS").status, "ERROR");
  assert.equal(check({ ...env, WECHAT_APP_ID: "wx1234567890abcdef" }, "WECHAT").status, "ERROR");
  assert.equal(check({ ...env, WECHAT_APP_ID: "wx1234567890abcdef", WECHAT_APP_SECRET: "private", MINI_TOKEN_SECRET: randomBytes(32).toString("hex") }, "WECHAT").status, "PASS");
  assert.equal(check(env, "MINI_TOKEN_SECRET").code, "AUTH_SECRET_FALLBACK_USE_SEPARATE_ROTATION");
  assert.equal(check({ ...env, EMAIL_API_KEY: "private", EMAIL_FROM: "login@zhixian.asia" }, "UNSUBSCRIBE_TOKEN_SECRET").status, "WARN");
});

test("migration checksums tolerate Windows/Linux newlines and Prisma legacy hex, but not SQL changes", () => {
  const sql = "SELECT 1;\nSELECT 2;\n", windows = sql.replaceAll("\n", "\r\n");
  const digest = createHash("sha256").update(windows).digest();
  assert.ok(migrationChecksums(sql).includes(digest.toString("hex")));
  assert.ok(migrationChecksums(windows).includes(createHash("sha256").update(sql).digest("hex")));
  assert.ok(migrationChecksums(sql).includes([...digest].map((byte) => byte.toString(16)).join("")));
  assert.equal(migrationChecksums(sql).includes(createHash("sha256").update(sql.replace("SELECT 2", "SELECT 3")).digest("hex")), false);
});

test("actual CLI preserves Next env precedence, exposes no values and rejects unknown flags", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhixian-preflight-"));
  try {
    const env = validEnv();
    await writeFile(join(dir, ".env"), "AUTH_SECRET=too-short\nAPP_URL=https://base.invalid\n");
    await writeFile(join(dir, ".env.local"), `AUTH_SECRET=${env.AUTH_SECRET}\nAPP_URL=http://127.0.0.1:3100\n`);
    const childEnv = { ...env }; delete childEnv.AUTH_SECRET; delete childEnv.APP_URL;
    const result = await runCli([], childEnv, dir);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.checks.find((item) => item.id === "AUTH_SECRET").status, "PASS");
    assert.equal(report.checks.find((item) => item.id === "DATABASE_ACCESS").status, "UNVERIFIED");
    assert.equal((result.stdout + result.stderr).includes(env.AUTH_SECRET), false);
    const override = await runCli([], { ...childEnv, AUTH_SECRET: "too-short" }, dir);
    assert.equal(override.code, 2, "Shell values must override .env.local");
    const badFlag = await runCli(["--private-argument"], env);
    assert.equal(badFlag.code, 1); assert.equal((badFlag.stdout + badFlag.stderr).includes("--private-argument"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const url = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const isolated = url && ["localhost", "127.0.0.1"].includes(url.hostname) && /^zhixian_.*(?:test|e2e)$/.test(url.pathname.slice(1));
if (process.env.CI === "true") assert.ok(isolated, "CI preflight tests require isolated PostgreSQL");
test("real database and CLI verify both connections and migration checksums without modifying records", { skip: !isolated }, async (t) => {
  const root = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
  const dirs = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const scripts = await Promise.all(dirs.map(async (entry) => ({ name: entry.name, sql: await readFile(join(root, entry.name, "migration.sql"), "utf8") })));
  const migrations = scripts.map((entry) => ({ name: entry.name, checksums: migrationChecksums(entry.sql) }));
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const snapshot = async () => (await db.query('SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" ORDER BY id')).rows;
  const before = await snapshot();
  try {
    await t.test("actual CLI has two read-only connections and matches applied checksums/vector", async () => {
      const env = { ...validEnv(), DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DATABASE_URL };
      const result = await runCli(["--no-env-files", "--database"], env);
      assert.equal(result.code, 0, result.stderr);
      const report = JSON.parse(result.stdout);
      for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
        assert.equal(report.checks.find((item) => item.id === `${key}_CONNECTION`).code, "CONNECTED_READ_ONLY");
        assert.equal(report.checks.find((item) => item.id === `${key}_MIGRATION_LEDGER`).status, "PASS");
        assert.equal(report.checks.find((item) => item.id === `${key}_VECTOR_COLUMN`).status, "PASS");
      }
      assert.equal(report.releaseReady, false);
      assert.equal((result.stdout + result.stderr).includes(process.env.DATABASE_URL), false);
    });
    await t.test("altered expected checksum and missing local migration are detected", async () => {
      const altered = migrations.map((row, index) => index ? row : { ...row, checksums: ["0".repeat(64)] });
      for (const expected of [altered, migrations.slice(1)]) {
        const result = await inspectDatabase(process.env.DATABASE_URL, expected);
        assert.equal(result.find((item) => item.id === "MIGRATION_LEDGER").status, "ERROR");
      }
    });
    await t.test("changing checkout newline format still matches the real migration ledger", async () => {
      const changed = scripts.map((entry) => ({ name: entry.name, checksums: migrationChecksums(entry.sql.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")) }));
      const result = await inspectDatabase(process.env.DATABASE_URL, changed);
      assert.equal(result.find((item) => item.id === "MIGRATION_LEDGER").status, "PASS");
    });
    await t.test("unreachable credential-bearing connection errors are sanitized", async () => {
      const result = await inspectDatabase("postgresql://private-user:private-password@127.0.0.1:1/private-db", migrations);
      assert.equal(result.at(-1).code, "CONNECTION_UNAVAILABLE");
      assert.equal(JSON.stringify(result).includes("private"), false);
    });
    assert.deepEqual(await snapshot(), before);
  } finally { await db.end(); }
});
