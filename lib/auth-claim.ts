import type { Prisma } from "@prisma/client";

export class InvalidAuthClaim extends Error {}

export async function consumeOtp(tx: Prisma.TransactionClient, otpId: string, now = new Date()) {
  const consumed = await tx.emailOtp.updateMany({
    where: { id: otpId, usedAt: null, lockedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (consumed.count !== 1) throw new InvalidAuthClaim("Invalid or consumed credentials");
}

export async function claimWebAccount(tx: Prisma.TransactionClient, email: string, inviteCode: string, otpId: string) {
  const now = new Date();
  await consumeOtp(tx, otpId, now);
  const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing) {
    const claimed = await tx.invitation.updateMany({
      where: { code: inviteCode, usedAt: null, AND: [
        { OR: [{ email: null }, { email }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ] },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new InvalidAuthClaim("Invalid or consumed credentials");
  }
  const user = await tx.user.upsert({ where: { email }, update: {}, create: { email } });
  await tx.userPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, topics: ["AI 行业", "大模型", "GitHub 开源项目"] } });
  return user;
}
