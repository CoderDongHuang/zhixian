import type { PrismaClient } from "@prisma/client";

type Rule = { scope: string; subject: string; limit: number; windowMs: number; blockMs: number };
export async function consumeRateRule(db: PrismaClient, hash: (value: string) => string, rule: Rule, now = new Date()) {
  const key = hash(`auth-throttle:${rule.scope}:${rule.subject}`);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const current = await tx.authThrottle.findUnique({ where: { key } });
    if (current?.blockedUntil && current.blockedUntil > now) return true;
    const expired = !current || now.getTime() - current.windowStartedAt.getTime() >= rule.windowMs;
    const count = expired ? 1 : current.count + 1;
    const blockedUntil = count > rule.limit ? new Date(now.getTime() + rule.blockMs) : null;
    await tx.authThrottle.upsert({ where: { key }, create: { key, scope: rule.scope, count, windowStartedAt: now, blockedUntil },
      update: { scope: rule.scope, count, windowStartedAt: expired ? now : current!.windowStartedAt, blockedUntil } });
    return Boolean(blockedUntil);
  });
}

export async function checkLatestOtp(db: PrismaClient, hash: (value: string) => string, email: string, code: string, maxAttempts: number, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`otp-verify:${email}`}, 0))::text`;
    const otp = await tx.emailOtp.findFirst({ where: { email, usedAt: null, lockedAt: null, expiresAt: { gt: now } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (otp?.codeHash === hash(code)) return { otp, locked: false };
    if (!otp) return { otp: null, locked: false };
    const failed = await tx.emailOtp.update({ where: { id: otp.id }, data: { attemptCount: { increment: 1 } } });
    const locked = failed.attemptCount >= maxAttempts;
    if (locked) await tx.emailOtp.update({ where: { id: otp.id }, data: { lockedAt: now, usedAt: now } });
    return { otp: null, locked };
  });
}
