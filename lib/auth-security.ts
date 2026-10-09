import { consumeRateRule, checkLatestOtp } from "@/lib/auth-security-storage";
import { hashSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const OTP_MAX_ATTEMPTS = 5;

export type LimitRule = {
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

export async function enforceAuthLimits(rules: LimitRule[]) {
  return enforceRateLimits(rules, "auth_rate_limited");
}

export async function enforceRateLimits(rules: LimitRule[], eventKind = "rate_limited") {
  for (const rule of rules) {
    if (await consumeRateRule(prisma, hashSecret, rule)) {
      await recordSecurityEvent(eventKind, rule.subject, { scope: rule.scope });
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
  const result = await checkLatestOtp(prisma, hashSecret, email, code, OTP_MAX_ATTEMPTS, now);
  if (!result?.otp) await recordSecurityEvent("otp_verification_failed", email, { locked: result?.locked ?? false });
  return result?.otp ?? null;
}

export async function waitForMinimumDuration(startedAt: number, minimumMs = 300) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
