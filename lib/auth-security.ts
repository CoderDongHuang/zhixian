import { Prisma } from "@prisma/client";
import { hashSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const OTP_MAX_ATTEMPTS = 5;

type LimitRule = {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
  blockMs: number;
};

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 128);
}

export function getDeviceSubject(request: Request, deviceId = "") {
  return (deviceId.trim() || request.headers.get("x-device-id")?.trim() || "").slice(0, 256);
}

export function otpRequestRules(request: Request, email: string, deviceId = ""): LimitRule[] {
  const ip = getClientIp(request);
  const device = getDeviceSubject(request, deviceId);
  const rules: LimitRule[] = [
    { scope: "otp-request-ip-hour", subject: ip, limit: 10, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
    { scope: "otp-request-ip-day", subject: ip, limit: 30, windowMs: 24 * 60 * 60_000, blockMs: 60 * 60_000 },
    { scope: "otp-request-email-minute", subject: email, limit: 1, windowMs: 60_000, blockMs: 60_000 },
    { scope: "otp-request-email-hour", subject: email, limit: 3, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
    { scope: "otp-request-email-day", subject: email, limit: 8, windowMs: 24 * 60 * 60_000, blockMs: 2 * 60 * 60_000 },
  ];
  if (device) rules.push(
    { scope: "otp-request-device-hour", subject: device, limit: 5, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
    { scope: "otp-request-device-day", subject: device, limit: 15, windowMs: 24 * 60 * 60_000, blockMs: 60 * 60_000 },
  );
  return rules;
}

export function otpVerifyRules(request: Request, email: string, deviceId = ""): LimitRule[] {
  const ip = getClientIp(request);
  const device = getDeviceSubject(request, deviceId);
  const rules: LimitRule[] = [
    { scope: "otp-verify-ip", subject: ip, limit: 30, windowMs: 10 * 60_000, blockMs: 30 * 60_000 },
    { scope: "otp-verify-email", subject: email, limit: 10, windowMs: 10 * 60_000, blockMs: 30 * 60_000 },
  ];
  if (device) rules.push({ scope: "otp-verify-device", subject: device, limit: 15, windowMs: 10 * 60_000, blockMs: 30 * 60_000 });
  return rules;
}

async function consumeRule(rule: LimitRule, now = new Date()) {
  const key = hashSecret(`auth-throttle:${rule.scope}:${rule.subject}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.authThrottle.findUnique({ where: { key } });
        if (current?.blockedUntil && current.blockedUntil > now) return true;
        const expired = !current || now.getTime() - current.windowStartedAt.getTime() >= rule.windowMs;
        const count = expired ? 1 : current.count + 1;
        const blockedUntil = count > rule.limit ? new Date(now.getTime() + rule.blockMs) : null;
        await tx.authThrottle.upsert({
          where: { key },
          create: { key, scope: rule.scope, count, windowStartedAt: now, blockedUntil },
          update: { scope: rule.scope, count, windowStartedAt: expired ? now : current!.windowStartedAt, blockedUntil },
        });
        return Boolean(blockedUntil);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  return true;
}

export async function enforceAuthLimits(rules: LimitRule[]) {
  for (const rule of rules) {
    if (await consumeRule(rule)) {
      await recordSecurityEvent("auth_rate_limited", rule.subject, { scope: rule.scope });
      return true;
    }
  }
  return false;
}

export async function recordSecurityEvent(kind: string, subject: string | null, metadata?: Record<string, string | number | boolean>) {
  await prisma.securityEvent.create({
    data: { kind, subjectHash: subject ? hashSecret(`security-subject:${subject}`) : null, metadata },
  }).catch((error) => console.error(`security event write failed: ${String(error)}`));
}

export async function verifyLatestOtp(email: string, code: string, now = new Date()) {
  let result: { otp: Awaited<ReturnType<typeof prisma.emailOtp.findFirst>>; locked: boolean } | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const otp = await tx.emailOtp.findFirst({
          where: { email, usedAt: null, lockedAt: null, expiresAt: { gt: now } },
          orderBy: { createdAt: "desc" },
        });
        if (otp?.codeHash === hashSecret(code)) return { otp, locked: false };
        if (!otp) return { otp: null, locked: false };
        const failed = await tx.emailOtp.update({ where: { id: otp.id }, data: { attemptCount: { increment: 1 } } });
        const locked = failed.attemptCount >= OTP_MAX_ATTEMPTS;
        if (locked) await tx.emailOtp.update({ where: { id: otp.id }, data: { lockedAt: now, usedAt: now } });
        return { otp: null, locked };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      break;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  if (!result?.otp) await recordSecurityEvent("otp_verification_failed", email, { locked: result?.locked ?? false });
  return result?.otp ?? null;
}

export async function waitForMinimumDuration(startedAt: number, minimumMs = 300) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
