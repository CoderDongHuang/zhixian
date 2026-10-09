import { randomBytes, createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

type Collection = Prisma.ResearchCollectionGetPayload<{ include: { items: true } }>;
export async function allocateResearchShare(db: PrismaClient, userId: string, collectionId: string, ttlDays: number,
  resolve: (tx: Prisma.TransactionClient, collection: Collection, version: number) => Promise<Prisma.InputJsonValue>) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ResearchCollection" WHERE id = ${collectionId} AND "userId" = ${userId} FOR UPDATE`;
        if (!locked.length) return null;
        const collection = await tx.researchCollection.findUniqueOrThrow({ where: { id: collectionId }, include: { items: { orderBy: { createdAt: "asc" } } } });
        const latest = await tx.researchShare.aggregate({ where: { collectionId }, _max: { version: true } });
        const version = (latest._max.version ?? 0) + 1;
        const snapshot = await resolve(tx, collection, version);
        const token = randomBytes(32).toString("base64url");
        const share = await tx.researchShare.create({ data: { collectionId, createdById: userId, version, snapshot,
          tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + ttlDays * 86400000) } });
        return { share, token };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code) || attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 10));
    }
  }
  throw new Error("Research share contention exceeded retry limit");
}
