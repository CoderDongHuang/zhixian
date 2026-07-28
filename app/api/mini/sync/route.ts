import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateMiniRequest } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";
import { shouldApplyChange, validIdempotencyKey } from "@/lib/sync-policy";

type Mutation = { resource?: string; resourceId?: string; value?: unknown; changedAt?: string };
const resources = new Set(["bookmark", "read", "learning_task"]);

function mutationTime(value: unknown) {
  const parsed = typeof value === "string" ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return new Date(Math.min(parsed.getTime(), Date.now() + 5 * 60_000));
}

export async function GET(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cursorValue = new URL(request.url).searchParams.get("cursor") || "0";
  let cursor: bigint;
  try { cursor = BigInt(cursorValue); } catch { return NextResponse.json({ error: "invalid cursor" }, { status: 400 }); }
  const initialSync = cursor === BigInt(0);
  const [changes, bookmarks, reads, paths, tasks] = await Promise.all([
    prisma.syncChange.findMany({ where: { userId: auth.user.id, sequence: { gt: cursor } }, orderBy: { sequence: "asc" }, take: 200 }),
    initialSync ? prisma.bookmark.findMany({ where: { userId: auth.user.id }, select: { feedItemId: true, createdAt: true } }) : Promise.resolve([]),
    initialSync ? prisma.readHistory.findMany({ where: { userId: auth.user.id }, select: { feedItemId: true, readAt: true } }) : Promise.resolve([]),
    initialSync ? prisma.learningPath.findMany({ where: { userId: auth.user.id, active: true }, orderBy: { updatedAt: "desc" }, take: 1 }) : Promise.resolve([]),
    initialSync ? prisma.learningTask.findMany({ where: { userId: auth.user.id }, orderBy: { scheduledFor: "desc" }, take: 30 }) : Promise.resolve([]),
  ]);
  const nextCursor = changes.length ? changes.at(-1)!.sequence : cursor;
  return NextResponse.json({
    cursor: nextCursor.toString(),
    hasMore: changes.length === 200,
    changes: changes.map((item) => ({ sequence: item.sequence.toString(), resource: item.resource, resourceId: item.resourceId, value: item.value, changedAt: item.changedAt })),
    snapshot: initialSync ? { bookmarks, reads, paths, tasks } : null,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().slice(0, 128) : "";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim().slice(0, 128) || "";
  const mutations = Array.isArray(body?.mutations) ? body.mutations as Mutation[] : [];
  if (!deviceId || deviceId !== auth.session.deviceId || !validIdempotencyKey(idempotencyKey) || mutations.length > 100) return NextResponse.json({ error: "invalid sync request" }, { status: 400 });
  if (mutations.some((item) => !resources.has(item.resource || "") || typeof item.resourceId !== "string" || !item.resourceId)) return NextResponse.json({ error: "invalid mutation" }, { status: 400 });
  const existing = await prisma.syncRequest.findUnique({ where: { userId_deviceId_idempotencyKey: { userId: auth.user.id, deviceId, idempotencyKey } } });
  if (existing) return NextResponse.json(existing.response);
  try {
    const response = await prisma.$transaction(async (tx) => {
      const outcomes: { resource: string; resourceId: string; applied: boolean }[] = [];
      for (const mutation of mutations) {
        const resource = mutation.resource!;
        const resourceId = mutation.resourceId!;
        const changedAt = mutationTime(mutation.changedAt);
        const state = await tx.syncState.findUnique({ where: { userId_resource_resourceId: { userId: auth.user.id, resource, resourceId } } });
        if (!shouldApplyChange(state?.clientChangedAt || null, changedAt)) {
          outcomes.push({ resource, resourceId, applied: false });
          continue;
        }
        if (resource === "bookmark") {
          const exists = await tx.feedItem.count({ where: { id: resourceId } });
          if (!exists) throw new Error("unknown feed item");
          const bookmarked = Boolean((mutation.value as { bookmarked?: unknown } | null)?.bookmarked);
          if (bookmarked) await tx.bookmark.upsert({ where: { userId_feedItemId: { userId: auth.user.id, feedItemId: resourceId } }, update: {}, create: { userId: auth.user.id, feedItemId: resourceId } });
          else await tx.bookmark.deleteMany({ where: { userId: auth.user.id, feedItemId: resourceId } });
        } else if (resource === "read") {
          const exists = await tx.feedItem.count({ where: { id: resourceId } });
          if (!exists) throw new Error("unknown feed item");
          await tx.readHistory.upsert({ where: { userId_feedItemId: { userId: auth.user.id, feedItemId: resourceId } }, update: { readAt: changedAt }, create: { userId: auth.user.id, feedItemId: resourceId, readAt: changedAt } });
        } else {
          const task = await tx.learningTask.findFirst({ where: { id: resourceId, userId: auth.user.id } });
          if (!task) throw new Error("unknown learning task");
          const completed = Boolean((mutation.value as { completed?: unknown } | null)?.completed);
          await tx.learningTask.update({ where: { id: resourceId }, data: { completedAt: completed ? changedAt : null } });
          if (task.pathId) {
            const [all, done] = await Promise.all([tx.learningTask.count({ where: { pathId: task.pathId } }), tx.learningTask.count({ where: { pathId: task.pathId, completedAt: { not: null } } })]);
            await tx.learningPath.update({ where: { id: task.pathId }, data: { progress: all ? Math.round(done / all * 100) : 0 } });
          }
        }
        const value = (mutation.value ?? {}) as Prisma.InputJsonValue;
        await tx.syncState.upsert({ where: { userId_resource_resourceId: { userId: auth.user.id, resource, resourceId } }, update: { value, clientChangedAt: changedAt }, create: { userId: auth.user.id, resource, resourceId, value, clientChangedAt: changedAt } });
        await tx.syncChange.create({ data: { userId: auth.user.id, resource, resourceId, value } });
        outcomes.push({ resource, resourceId, applied: true });
      }
      const latest = await tx.syncChange.findFirst({ where: { userId: auth.user.id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const result = { ok: true, cursor: (latest?.sequence || BigInt(0)).toString(), outcomes };
      await tx.syncRequest.create({ data: { userId: auth.user.id, deviceId, idempotencyKey, response: result } });
      return result;
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.syncRequest.findUnique({ where: { userId_deviceId_idempotencyKey: { userId: auth.user.id, deviceId, idempotencyKey } } });
      if (replay) return NextResponse.json(replay.response);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "sync failed" }, { status: 409 });
  }
}
