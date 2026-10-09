import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export function e2eSettings(env: NodeJS.ProcessEnv = process.env) {
  if (env.E2E_TEST_MODE !== "true" || !env.E2E_TEST_SECRET || env.VERCEL_ENV === "production" || env.APP_ENV === "production") return null;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    const app = new URL(env.APP_URL ?? "");
    const database = decodeURIComponent(url.pathname.slice(1));
    const loopback = (host: string) => ["127.0.0.1", "localhost", "[::1]"].includes(host);
    if (!loopback(url.hostname) || !loopback(app.hostname) || !/^zhixian_[a-z0-9_]*(?:test|e2e)$/.test(database) || !["postgresql:", "postgres:"].includes(url.protocol)) return null;
    return { database, fingerprint: createHash("sha256").update(`zhixian-isolated-e2e:${database}:${env.E2E_TEST_SECRET}`).digest("hex") };
  } catch { return null; }
}

export async function isIsolatedE2e(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  const settings = e2eSettings(env);
  if (!settings) return false;
  try {
    const rows = await db.$queryRaw<{ database: string; fingerprint: string }[]>`SELECT current_database() AS database, fingerprint FROM "E2eDatabaseIdentity" WHERE id = 1`;
    return rows.length === 1 && rows[0].database === settings.database && rows[0].fingerprint === settings.fingerprint;
  } catch { return false; }
}
