import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { replayTarget } from "../lib/pipeline-tasks.mjs";

export const REPLAY_SCRIPTS = Object.freeze({
  "source-ingest": ["ingest-sources"], "community-ingest": ["ingest-community"],
  "content-process": ["process-documents"], "content-analyze": ["analyze-events"],
  "review-auto-resolve": ["auto-resolve-reviews"], "entity-extract": ["extract-entities"],
  "content-embed": ["embed-documents"], "trend-github": ["collect-trends"],
  "trend-paper": ["collect-trends"], "trend-feed": ["collect-trends"], "trend-bridge": ["collect-trends"],
  "trend-forecast": ["generate-trend-forecasts"],
  "digest-generate-morning": ["generate-digest", "MORNING"],
  "digest-generate-evening": ["generate-digest", "EVENING"],
  "digest-generate-weekly": ["generate-digest", "WEEKLY"],
});

const [id, mode] = process.argv.slice(2);
if (!id || (mode && mode !== "--execute")) throw new Error("Usage: npm run tasks:replay -- <task-id> [--execute]; default is read-only");
const db = new PrismaClient();
try {
  process.env.PIPELINE_REPLAY_TASK = id;
  const task = await replayTarget(db, Object.keys(REPLAY_SCRIPTS));
  console.log(JSON.stringify({ taskId: task.id, name: task.name, resourceId: task.resourceId, revision: task.revision, status: task.status, execute: mode === "--execute" }));
  if (mode === "--execute") {
    const [script, ...args] = REPLAY_SCRIPTS[task.name];
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`scripts/${script}.mjs`, ...args], { env: process.env, stdio: "inherit" });
      child.once("error", reject); child.once("exit", resolve);
    });
    const result = await db.pipelineTask.findUniqueOrThrow({ where: { id } });
    if (code !== 0 || !["SUCCEEDED", "SUPERSEDED"].includes(result.status)) throw new Error("REPLAY_INCOMPLETE: inspect task status; no successful replay confirmed");
  }
} finally { await db.$disconnect(); }
