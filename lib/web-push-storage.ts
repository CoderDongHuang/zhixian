import type { PrismaClient } from "@prisma/client";

export async function saveWebPushIntent(db: PrismaClient, userId: string, input: { endpoint: string; changedAt: number; enabled: boolean; keys?: { p256dh: string; auth: string }; userAgent?: string | null }) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.endpoint}, 0))::text`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const prior = await tx.webPushIntent.findUnique({ where: { userId_endpoint: { userId, endpoint: input.endpoint } } });
    if (prior && prior.changedAt >= BigInt(input.changedAt)) return prior.enabled === input.enabled;
    const existing = await tx.deviceSubscription.findUnique({ where: { endpoint: input.endpoint } });
    if (existing && existing.userId !== userId) return false;
    await tx.webPushIntent.upsert({ where: { userId_endpoint: { userId, endpoint: input.endpoint } }, create: { userId, endpoint: input.endpoint, changedAt: BigInt(input.changedAt), enabled: input.enabled }, update: { changedAt: BigInt(input.changedAt), enabled: input.enabled } });
    if (input.enabled && input.keys) {
      await tx.deviceSubscription.upsert({ where: { endpoint: input.endpoint }, create: { userId, endpoint: input.endpoint, ...input.keys, userAgent: input.userAgent }, update: { ...input.keys, userAgent: input.userAgent } });
    } else await tx.deviceSubscription.deleteMany({ where: { userId, endpoint: input.endpoint } });
    const enabled = await tx.deviceSubscription.count({ where: { userId } }) > 0;
    await tx.userPreference.updateMany({ where: { userId }, data: { pushEnabled: enabled } });
    return true;
  });
}
