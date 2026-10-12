import { createECDH, createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { budgetPolicy } from "./ai-budget.mjs";
import { modelPrice } from "./ai-telemetry.mjs";
import { configuredEmbeddingDimensions } from "./embedding-policy.mjs";

const present = (value) => typeof value === "string" && !!value.trim();
const placeholder = (value) => /replace-with|your[-_]|example\.(?:com|supabase\.co)|^password$/.test(value || "");
const loopback = (host) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
const secretValid = (value, production) => present(value) && value.length >= 24 && !placeholder(value) && (!production || !/^(?:e2e|test|local)-/.test(value));
const endpoint = (value, localAllowed) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.hash && !placeholder(value) &&
      (url.protocol === "https:" || localAllowed && url.protocol === "http:" && loopback(url.hostname)) ? url : null;
  } catch { return null; }
};
export function databaseUrlValid(value) {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && !!url.hostname && url.pathname.length > 1 && !url.hash && !placeholder(value);
  } catch { return false; }
}

export function migrationChecksums(script) {
  // Match Prisma's script_matches_checksum, including its legacy hex format.
  // https://github.com/prisma/prisma-engines/blob/main/schema-engine/connectors/schema-connector/src/checksum.rs
  return [...new Set([script, script.replaceAll("\r\n", "\n"), script.replaceAll("\n", "\r\n")].flatMap((text) => {
    const digest = createHash("sha256").update(text).digest();
    return [digest.toString("hex"), [...digest].map((byte) => byte.toString(16)).join("")];
  }))];
}

// Output consists only of fixed identifiers/codes. Never include supplied values.
export function configurationPreflight(env, { production = false } = {}) {
  const checks = [];
  const add = (id, status, code) => checks.push({ id, status, code });
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    add(name, databaseUrlValid(env[name]) ? "PASS" : "ERROR", databaseUrlValid(env[name]) ? "FORMAT_ONLY" : "MISSING_OR_INVALID");
  }
  if (databaseUrlValid(env.DIRECT_URL)) {
    const url = new URL(env.DIRECT_URL);
    if (url.port === "6543" && /pooler\.supabase\.com$/.test(url.hostname)) add("DIRECT_URL_MODE", "ERROR", "TRANSACTION_POOLER_NOT_MIGRATION_CONNECTION");
  }
  const app = endpoint(env.APP_URL, !production);
  add("APP_URL", app && !app.search && app.pathname === "/" ? "PASS" : "ERROR", app && !app.search && app.pathname === "/" ? "FORMAT_ONLY" : "INVALID_APP_ORIGIN");
  add("AUTH_SECRET", secretValid(env.AUTH_SECRET, production) ? "PASS" : "ERROR", secretValid(env.AUTH_SECRET, production) ? "FORMAT_ONLY" : "MISSING_WEAK_OR_PLACEHOLDER");
  add("E2E_TEST_MODE", production && (env.E2E_TEST_MODE === "true" || present(env.E2E_TEST_SECRET)) ? "ERROR" : "PASS", production && (env.E2E_TEST_MODE === "true" || present(env.E2E_TEST_SECRET)) ? "TEST_CREDENTIALS_IN_PRODUCTION" : "MODE_CHECKED");
  add("CONTENT_PIPELINE_STATE", ["active", "paused"].includes(env.CONTENT_PIPELINE_STATE) ? "PASS" : "ERROR", env.CONTENT_PIPELINE_STATE === "paused" ? "INTENTIONALLY_PAUSED" : env.CONTENT_PIPELINE_STATE === "active" ? "ACTIVE_REQUIRES_SOURCE_ACCEPTANCE" : "STATE_REQUIRED");
  for (const name of ["MONITOR_TOKEN", "CRON_SECRET"]) {
    const required = production && (name === "MONITOR_TOKEN" || env.CONTENT_PIPELINE_STATE === "active");
    add(name, !present(env[name]) && !required ? "WARN" : secretValid(env[name], production) ? "PASS" : "ERROR", !present(env[name]) && !required ? "NOT_CONFIGURED" : secretValid(env[name], production) ? "FORMAT_ONLY" : "MISSING_WEAK_OR_PLACEHOLDER");
  }

  const models = [];
  const model = (id, key, url, name, localAllowed, optional = true) => {
    if (!present(key) && optional) { add(id, "DISABLED", "NO_API_KEY"); return; }
    const parsed = endpoint(url, localAllowed);
    if (!present(key) || placeholder(key) || !parsed || !present(name)) { add(id, "ERROR", "PARTIAL_OR_INVALID_MODEL_CONFIG"); return; }
    add(id, "PASS", "FORMAT_ONLY_NOT_AUTHENTICATED");
    models.push({ id, provider: parsed.host, name });
  };
  model("AI", env.AI_API_KEY, env.AI_API_URL, env.AI_MODEL, !production, !present(env.AI_API_URL) && !present(env.AI_MODEL));
  model("ANALYSIS_AI", env.ANALYSIS_AI_API_KEY, env.ANALYSIS_AI_API_URL, env.ANALYSIS_AI_MODEL, !production, !present(env.ANALYSIS_AI_API_URL) && !present(env.ANALYSIS_AI_MODEL));
  // Learning uses per-field fallback, matching lib/learning.ts, and requires HTTPS.
  const learning = [env.LEARNING_AI_API_KEY || env.ANALYSIS_AI_API_KEY || env.AI_API_KEY, env.LEARNING_AI_API_URL || env.ANALYSIS_AI_API_URL || env.AI_API_URL, env.LEARNING_AI_MODEL || env.ANALYSIS_AI_MODEL || env.AI_MODEL];
  model("LEARNING_AI_EFFECTIVE", ...learning, false, !learning.some(present));
  model("RESEARCH_AI", env.RESEARCH_AI_API_KEY, env.RESEARCH_AI_API_URL, env.RESEARCH_AI_MODEL, !production, !present(env.RESEARCH_AI_API_URL) && !present(env.RESEARCH_AI_MODEL));
  model("EMBEDDING", env.EMBEDDING_API_KEY, env.EMBEDDING_API_URL, env.EMBEDDING_MODEL, !production);
  try { configuredEmbeddingDimensions(env.EMBEDDING_DIMENSIONS); add("EMBEDDING_DIMENSIONS", "PASS", "MATCHES_VECTOR_1024"); }
  catch { add("EMBEDDING_DIMENSIONS", "ERROR", "VECTOR_DIMENSION_MISMATCH"); }
  for (const name of ["RESEARCH_AI_TIMEOUT_MS", "LEARNING_AI_TIMEOUT_MS"]) {
    if (present(env[name]) && (!Number.isFinite(Number(env[name])) || Number(env[name]) < 5000 || Number(env[name]) > 60000)) add(name, "WARN", "RUNTIME_WILL_CLAMP_OR_DEFAULT");
  }
  try {
    const policy = budgetPolicy(env);
    add("AI_BUDGET", policy ? "PASS" : models.length ? "ERROR" : "DISABLED", policy ? "POLICY_FORMAT_ONLY" : models.length ? "PAID_MODELS_WITHOUT_BUDGET" : "NO_PAID_MODELS");
    if (policy) for (const { id, provider, name } of models) add(`${id}_PRICE`, modelPrice(name, provider, env) ? "PASS" : "ERROR", modelPrice(name, provider, env) ? "FORMAT_ONLY_NOT_SUPPLIER_VERIFIED" : "PRICE_REQUIRED");
  } catch { add("AI_BUDGET", "ERROR", "INVALID_OR_MISSING_POLICY"); }

  const mailConfigured = present(env.EMAIL_API_KEY) || present(env.EMAIL_FROM) && !placeholder(env.EMAIL_FROM);
  const email = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "") && !placeholder(value);
  add("LOGIN_EMAIL", present(env.EMAIL_API_KEY) && !placeholder(env.EMAIL_API_KEY) && email(env.EMAIL_FROM) ? "PASS" : production || mailConfigured ? "ERROR" : "DISABLED", present(env.EMAIL_API_KEY) && !placeholder(env.EMAIL_API_KEY) && email(env.EMAIL_FROM) ? "FORMAT_ONLY_DELIVERY_UNVERIFIED" : "LOGIN_MAIL_NOT_CONFIGURED");
  if (present(env.EMAIL_API_KEY)) {
    add("DIGEST_EMAIL_FROM", email(env.DIGEST_EMAIL_FROM) ? "PASS" : "WARN", email(env.DIGEST_EMAIL_FROM) ? "FORMAT_ONLY" : "DIGEST_SENDER_NOT_CONFIGURED");
    const explicit = present(env.UNSUBSCRIBE_TOKEN_SECRET), valid = secretValid(env.UNSUBSCRIBE_TOKEN_SECRET || env.AUTH_SECRET, production);
    add("UNSUBSCRIBE_TOKEN_SECRET", valid ? explicit ? "PASS" : "WARN" : "ERROR", valid ? explicit ? "FORMAT_ONLY" : "AUTH_SECRET_FALLBACK_USE_SEPARATE_ROTATION" : "MISSING_WEAK_OR_PLACEHOLDER");
  }
  if (present(env.UNSUBSCRIBE_TOKEN_PREVIOUS_SECRET)) add("UNSUBSCRIBE_TOKEN_PREVIOUS_SECRET", secretValid(env.UNSUBSCRIBE_TOKEN_PREVIOUS_SECRET, production) && env.UNSUBSCRIBE_TOKEN_PREVIOUS_SECRET !== env.UNSUBSCRIBE_TOKEN_SECRET ? "WARN" : "ERROR", "VERIFY_CONTROLLED_ROTATION_WINDOW");

  if (!present(env.VAPID_PUBLIC_KEY) && !present(env.VAPID_PRIVATE_KEY)) add("WEB_PUSH", "DISABLED", "NO_KEY_PAIR");
  else {
    let valid = false;
    try {
      const publicKey = Buffer.from(env.VAPID_PUBLIC_KEY || "", "base64url"), privateKey = Buffer.from(env.VAPID_PRIVATE_KEY || "", "base64url");
      const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(privateKey);
      valid = privateKey.length === 32 && publicKey.length === 65 && publicKey.toString("base64url") === env.VAPID_PUBLIC_KEY && privateKey.toString("base64url") === env.VAPID_PRIVATE_KEY && timingSafeEqual(ecdh.getPublicKey(), publicKey);
    } catch { /* Invalid keys are reported without echoing crypto errors. */ }
    const subject = env.VAPID_SUBJECT || "";
    valid = valid && (subject.startsWith("mailto:") ? email(subject.slice(7)) : !!endpoint(subject, false));
    add("WEB_PUSH", valid ? "PASS" : "ERROR", valid ? "KEY_PAIR_MATCHES_DELIVERY_UNVERIFIED" : "INVALID_KEY_PAIR_OR_SUBJECT");
  }
  const explicitMini = present(env.MINI_TOKEN_SECRET), miniValid = secretValid(env.MINI_TOKEN_SECRET || env.AUTH_SECRET, production);
  add("MINI_TOKEN_SECRET", miniValid ? explicitMini ? "PASS" : "WARN" : "ERROR", miniValid ? explicitMini ? "FORMAT_ONLY" : "AUTH_SECRET_FALLBACK_USE_SEPARATE_ROTATION" : "MISSING_WEAK_OR_PLACEHOLDER");
  if (![env.WECHAT_APP_ID, env.WECHAT_APP_SECRET].some(present)) add("WECHAT", "DISABLED", "NO_APP_CREDENTIALS");
  else {
    const valid = /^wx[a-zA-Z0-9]{16}$/.test(env.WECHAT_APP_ID || "") && present(env.WECHAT_APP_SECRET) && miniValid;
    add("WECHAT", valid ? "PASS" : "ERROR", valid ? "FORMAT_ONLY_PLATFORM_UNVERIFIED" : "PARTIAL_OR_INVALID_APP_CONFIG");
  }
  return checks;
}

export function preflightReport(checks, production) {
  return {
    version: 1, environment: production ? "production" : "local", status: checks.some((check) => check.status === "ERROR") ? "BLOCKED" : "CHECKS_PASSED",
    releaseReady: false, checks,
    pendingAcceptance: ["DEPLOYMENT_ENVIRONMENT_PARITY", "DATABASE_BACKUP_RESTORE_AND_FULL_SCHEMA_DRIFT", "REAL_MODEL_QUALITY_AND_SUPPLIER_BILLING", "NOTIFICATION_DELIVERY", "SOURCE_AUTHORIZATION_AND_FRESHNESS", "DEVICE_AND_PLATFORM_ACCEPTANCE"],
  };
}

export async function inspectDatabase(connectionString, migrations) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const checks = [];
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const readonly = await client.query("SHOW transaction_read_only");
    if (readonly.rows[0].transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED");
    checks.push({ id: "CONNECTION", status: "PASS", code: "CONNECTED_READ_ONLY" });
    const ledger = (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"')).rows.filter((row) => !row.rolled_back_at);
    const matches = ledger.length === migrations.length && migrations.every((migration) => {
      const rows = ledger.filter((row) => row.migration_name === migration.name);
      return rows.length === 1 && !!rows[0].finished_at && migration.checksums.includes(rows[0].checksum);
    });
    checks.push({ id: "MIGRATION_LEDGER", status: matches ? "PASS" : "ERROR", code: matches ? "ALL_LOCAL_CHECKSUMS_APPLIED" : "MISSING_FAILED_EXTRA_OR_CHANGED_MIGRATION" });
    const vectors = (await client.query(`SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = to_regclass('"Embedding"') AND attname = 'vector' AND NOT attisdropped`)).rows;
    const correctVector = vectors.length === 1 && vectors[0].type === "vector(1024)";
    checks.push({ id: "VECTOR_COLUMN", status: correctVector ? "PASS" : "ERROR", code: correctVector ? "VECTOR_1024" : "MISSING_OR_WRONG_VECTOR_TYPE" });
  } catch {
    checks.push({ id: "DATABASE_ACCESS", status: "ERROR", code: connected ? "SCHEMA_OR_READ_ONLY_CHECK_UNAVAILABLE" : "CONNECTION_UNAVAILABLE" });
  } finally {
    // Always roll back; this tool never deploys migrations or writes records.
    try { await client.query("ROLLBACK"); } catch { /* No connection or transaction. */ }
    await client.end().catch(() => {});
  }
  return checks;
}
