import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (existsSync(".env")) {
  const config = parseEnv(readFileSync(".env", "utf8").replace(/^\uFEFF/, ""));
  for (const [key, value] of Object.entries(config)) if (process.env[key] === undefined) process.env[key] = value;
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env");

// Only these two collectors run. No translation, model calls, or deliveries.
const env = { ...process.env, PRODUCT_HUNT_ENABLED: "false", REDDIT_ENABLED: "false", PIPELINE_REPLAY_TASK: "" };
const database = new URL(env.DATABASE_URL);
database.searchParams.set("connection_limit", "2");
database.searchParams.set("connect_timeout", "30");
database.searchParams.set("pool_timeout", "30");
env.DATABASE_URL = database.href;
for (const key of Object.keys(env)) {
  if (/(?:AI|EMBEDDING|EMAIL|VAPID|EXPO).*(?:KEY|TOKEN|SECRET)/.test(key)) env[key] = "";
}
let failed = false;
for (const script of ["ingest-sources.mjs", "ingest-community.mjs"]) {
  console.log(JSON.stringify({ stage: script, startedAt: new Date().toISOString() }));
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, ["--use-system-ca", `scripts/${script}`], { cwd: root, env, stdio: "inherit", timeout: 8 * 60_000 });
    child.on("error", () => resolve(1));
    child.on("exit", code => resolve(code ?? 1));
  });
  if (code !== 0) failed = true;
}
console.log(JSON.stringify({ mode: "free-collection", status: failed ? "FAILED" : "SUCCEEDED", finishedAt: new Date().toISOString() }));
process.exitCode = failed ? 1 : 0;
