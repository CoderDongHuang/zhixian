import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "industry_session";
export const OTP_TTL_MINUTES = 10;
export const SESSION_TTL_DAYS = 30;

export function hashSecret(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) throw new Error("AUTH_SECRET must contain at least 24 characters");
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

export function createOtp() {
  return randomInt(100000, 1000000).toString();
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSecret(token) },
    include: { user: { include: { preference: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}
