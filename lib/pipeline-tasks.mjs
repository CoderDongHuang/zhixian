import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

const context = new AsyncLocalStorage();
export const currentPipelineTask = () => context.getStore();
export const taskKey = (name, resourceId, revision) => createHash("sha256").update(JSON.stringify([name, resourceId, String(revision)])).digest("hex");

export async function claimTask(db, { name, resourceId, revision, replay = false, leaseMs = 120000, now = new Date() }) {
  if (!name || !resourceId || revision === undefined || !Number.isFinite(now.getTime()) || !Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error("Invalid task identity or lease");
  const key = taskKey(name, resourceId, revision);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const task = await tx.pipelineTask.upsert({ where: { key }, update: {}, create: { key, name, resourceId, revision: String(revision) } });
    if (["SUCCEEDED", "SUPERSEDED"].includes(task.status) || (task.status === "RUNNING" && task.leaseUntil > now)) return null;
    if (!replay && (task.attemptCount >= 3 || task.retryAt > now)) return null;
    await tx.pipelineAttempt.updateMany({ where: { taskId: task.id, status: "RUNNING" }, data: { status: "EXPIRED", finishedAt: now } });
    const token = randomUUID();
    const attempt = await tx.pipelineAttempt.create({ data: { taskId: task.id, token, status: "RUNNING", startedAt: now } });
    await tx.pipelineTask.update({ where: { id: task.id }, data: { status: "RUNNING", token, leaseUntil: new Date(now.getTime() + leaseMs), retryAt: null, attemptCount: { increment: 1 } } });
    return { db, taskId: task.id, attemptId: attempt.id, token, name, leaseMs };
  });
}

export async function assertTaskLease(tx, claim = currentPipelineTask()) {
  if (!claim) return;
  const [task] = await tx.$queryRaw`SELECT status, token, "leaseUntil" FROM "PipelineTask" WHERE id = ${claim.taskId} FOR UPDATE`;
  if (task?.status !== "RUNNING" || task.token !== claim.token || !task.leaseUntil || task.leaseUntil <= new Date()) throw new Error("TASK_LEASE_LOST");
}

export async function finishTask(claim, status, errorCode = null) {
  if (!["SUCCEEDED", "SUPERSEDED", "FAILED", "WAITING"].includes(status)) throw new Error("Invalid terminal task status");
  return claim.db.$transaction(async (tx) => {
    await assertTaskLease(tx, claim);
    const task = await tx.pipelineTask.findUniqueOrThrow({ where: { id: claim.taskId } });
    await tx.pipelineAttempt.update({ where: { id: claim.attemptId }, data: { status, errorCode, finishedAt: new Date() } });
    await tx.pipelineTask.update({ where: { id: claim.taskId }, data: { status, token: null, leaseUntil: null, retryAt: ["FAILED", "WAITING"].includes(status) ? new Date(Date.now() + Math.min(3600000, 30000 * 2 ** task.attemptCount)) : null } });
  });
}

export async function runTask(db, identity, work) {
  const replayId = process.env.PIPELINE_REPLAY_TASK;
  if (replayId) {
    const target = await db.pipelineTask.findUnique({ where: { id: replayId } });
    if (!target || target.key !== taskKey(identity.name, identity.resourceId, identity.revision)) throw new Error("REPLAY_TARGET_MISMATCH");
  }
  const claim = await claimTask(db, { ...identity, replay: Boolean(replayId) });
  if (!claim) {
    if (replayId) throw new Error("REPLAY_NOT_CLAIMABLE");
    return { skipped: true };
  }
  const heartbeat = setInterval(() => {
    void db.pipelineTask.updateMany({ where: { id: claim.taskId, token: claim.token, status: "RUNNING", leaseUntil: { gt: new Date() } }, data: { leaseUntil: new Date(Date.now() + claim.leaseMs) } }).catch(() => undefined);
  }, Math.max(10, Math.min(30000, claim.leaseMs / 3)));
  heartbeat.unref();
  try {
    const value = await context.run(claim, work);
    await finishTask(claim, value === "WAITING" ? "WAITING" : value === false || value === null ? "SUPERSEDED" : "SUCCEEDED");
    return { skipped: false, value };
  } catch (error) {
    await finishTask(claim, "FAILED", error?.message === "TASK_LEASE_LOST" ? "TASK_LEASE_LOST" : "EXECUTION_FAILED").catch(() => undefined);
    throw error;
  } finally { clearInterval(heartbeat); }
}

export async function replayTarget(db, name) {
  if (!process.env.PIPELINE_REPLAY_TASK) return null;
  const task = await db.pipelineTask.findUnique({ where: { id: process.env.PIPELINE_REPLAY_TASK } });
  if (!task || !(Array.isArray(name) ? name : [name]).includes(task.name) || !["FAILED", "WAITING", "RUNNING"].includes(task.status) || (task.status === "RUNNING" && task.leaseUntil > new Date())) throw new Error("Replay requires a failed, waiting or expired task of this pipeline");
  return task;
}

export function requireReplaySelection(replay, selected) {
  if (replay && !selected.length) throw new Error("REPLAY_RESOURCE_UNAVAILABLE: material changed, resource removed or configuration disabled");
}
