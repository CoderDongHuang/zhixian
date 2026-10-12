import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { configurationPreflight, databaseUrlValid, inspectDatabase, migrationChecksums, preflightReport } from "../lib/configuration-preflight.mjs";

try {
  const args = process.argv.slice(2);
  const allowed = ["--production", "--database", "--no-env-files"];
  if (args.some((arg) => !allowed.includes(arg)) || new Set(args).size !== args.length) throw new Error("INVALID_ARGUMENTS");
  if (!args.includes("--no-env-files")) {
    // Resolve Next's own env loader to preserve next start's file precedence.
    const require = createRequire(import.meta.url);
    const nextRequire = createRequire(require.resolve("next/package.json"));
    nextRequire("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() { throw new Error("ENV_LOAD_FAILED"); } });
  }
  const production = args.includes("--production"), checks = configurationPreflight(process.env, { production });
  if (args.includes("--database")) {
    const root = join(process.cwd(), "prisma", "migrations");
    const dirs = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const migrations = await Promise.all(dirs.map(async (entry) => ({ name: entry.name, checksums: migrationChecksums(await readFile(join(root, entry.name, "migration.sql"), "utf8")) })));
    for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
      if (!databaseUrlValid(process.env[key])) continue;
      const result = await inspectDatabase(process.env[key], migrations);
      checks.push(...result.map((check) => ({ ...check, id: `${key}_${check.id}` })));
    }
  } else checks.push({ id: "DATABASE_ACCESS", status: "UNVERIFIED", code: "USE_EXPLICIT_DATABASE_FLAG" });
  const report = preflightReport(checks, production);
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "BLOCKED") process.exitCode = 2;
} catch {
  console.error("Configuration preflight unavailable: check flags, environment files and local migrations. No supplied values or connection errors are printed.");
  process.exitCode = 1;
}
