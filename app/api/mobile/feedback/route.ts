import { NextResponse } from "next/server";
import { authenticateMiniRequest } from "@/lib/mini-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const rating = Number(body?.rating);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !message) return NextResponse.json({ error: "invalid feedback" }, { status: 400 });
  await prisma.behaviorEvent.create({ data: { userId: auth.user.id, action: "mobile_beta_feedback", value: rating, metadata: { message, appVersion: typeof body?.appVersion === "string" ? body.appVersion.slice(0, 30) : "unknown" } } });
  return NextResponse.json({ ok: true });
}
