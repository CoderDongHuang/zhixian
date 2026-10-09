import { PrismaClient } from "@prisma/client";
import { e2eSettings } from "../lib/e2e-policy.ts";

const settings = e2eSettings();
if (!settings) throw new Error("Refusing to mark a non-local, non-test database; set explicit E2E environment and loopback APP_URL");
const db = new PrismaClient();
try {
  const [identity] = await db.$queryRaw`SELECT current_database() AS database`;
  if (identity.database !== settings.database) throw new Error("Connected database identity does not match test database");
  await db.$executeRaw`CREATE TABLE IF NOT EXISTS "E2eDatabaseIdentity" (id integer PRIMARY KEY CHECK (id = 1), fingerprint text NOT NULL)`;
  await db.$executeRaw`INSERT INTO "E2eDatabaseIdentity" (id, fingerprint) VALUES (1, ${settings.fingerprint}) ON CONFLICT (id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint`;
  console.log(`Prepared isolated E2E database: ${settings.database}`);
} finally { await db.$disconnect(); }
