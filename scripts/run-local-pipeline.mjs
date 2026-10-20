import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { localFreeAiEnv } from "../lib/free-quota-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (existsSync(".env")) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(".env", "utf8").replace(/^\uFEFF/, "")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
async function run(script, env) {
  console.log(JSON.stringify({ stage: script, startedAt: new Date().toISOString() }));
  return new Promise(resolve => {
    const child = spawn(process.execPath, ["--use-system-ca", `scripts/${script}`], { cwd: root, env, stdio: "inherit", timeout: 18 * 60_000 });
    child.on("error", () => resolve(1));
    child.on("exit", code => resolve(code ?? 1));
  });
}
// Collection always runs, even when the AI allowance has expired or is unavailable.
let failed = process.argv.includes("--analyze-only") ? false : await run("collect-free.mjs", process.env) !== 0;
try {
  const env = localFreeAiEnv(process.env);
  if (env) {
    const database = new URL(env.DATABASE_URL);
    database.searchParams.set("connection_limit", "2");
    database.searchParams.set("connect_timeout", "30");
    database.searchParams.set("pool_timeout", "30");
    env.DATABASE_URL = database.href;
    // No embedding, email or push delivery stages are invoked.
    for (const script of ["process-documents.mjs", "analyze-events.mjs"]) {
      if (await run(script, env) !== 0) { failed = true; break; }
    }
  } else console.log("Local AI disabled; raw collection only.");
} catch (error) {
  console.error(error.message.startsWith("FREE_QUOTA_") ? error.message : "LOCAL_AI_CONFIGURATION_FAILED");
  failed = true;
}
console.log(JSON.stringify({ mode: "local-collection-and-free-ai", status: failed ? "FAILED" : "SUCCEEDED", finishedAt: new Date().toISOString() }));
process.exitCode = failed ? 1 : 0;
