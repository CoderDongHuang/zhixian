import type { Prisma, PrismaClient } from "@prisma/client";

export type AccountPurpose = "email-current" | "email-new" | "password";

export async function checkAccountCode(db: PrismaClient, userId: string, purpose: AccountPurpose, email: string, codeHash: string) {
  // A guarded increment caps attempts even when requests arrive concurrently.
  const claimed = await db.accountVerification.updateManyAndReturn({
    where: { userId, purpose, email, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
    data: { attempts: { increment: 1 } },
  });
  return claimed.length === 1 && claimed[0].codeHash === codeHash ? claimed[0] : null;
}

export async function consumeAccountCode(tx: Prisma.TransactionClient, id: string, codeHash: string) {
  const result = await tx.accountVerification.deleteMany({ where: { id, codeHash, expiresAt: { gt: new Date() } } });
  if (result.count !== 1) throw new Error("ACCOUNT_CODE_EXPIRED");
}

export async function revokeOtherSessions(tx: Prisma.TransactionClient, userId: string, currentTokenHash: string) {
  await tx.session.deleteMany({ where: { userId, tokenHash: { not: currentTokenHash } } });
  await tx.miniSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.emailOtp.updateMany({ where: { email: (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })).email || "", usedAt: null }, data: { usedAt: new Date() } });
  await tx.accountVerification.deleteMany({ where: { userId } });
}

export async function lockAccount(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`account:${userId}`}, 0))::text`;
}

export async function requireUnchangedAccount(tx: Prisma.TransactionClient, userId: string, email: string | null, tokenHash: string) {
  await lockAccount(tx, userId);
  const user = await tx.user.findUnique({ where: { id: userId } });
  const session = await tx.session.findUnique({ where: { tokenHash } });
  if (!user || user.email !== email || session?.userId !== userId || session.expiresAt <= new Date()) throw new Error("ACCOUNT_CODE_EXPIRED");
}
