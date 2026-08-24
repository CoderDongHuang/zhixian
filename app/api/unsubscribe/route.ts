import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token.mjs";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const userId = typeof form?.get("user") === "string" ? String(form.get("user")) : "";
  const token = typeof form?.get("token") === "string" ? String(form.get("token")) : "";
  let valid = false;
  try { valid = Boolean(verifyUnsubscribeToken(token, userId)); } catch { valid = false; }
  if (!valid) return NextResponse.redirect(new URL("/unsubscribe?result=invalid", request.url), 303);
  await prisma.userPreference.updateMany({ where: { userId }, data: { emailEnabled: false } });
  const success = new URL("/unsubscribe", request.url);
  success.searchParams.set("user", userId);
  success.searchParams.set("token", token);
  success.searchParams.set("result", "success");
  return NextResponse.redirect(success, 303);
}
