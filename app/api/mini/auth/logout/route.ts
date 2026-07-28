import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateMiniRequest } from "@/lib/mini-auth";

export async function POST(request: Request) {
  const auth = await authenticateMiniRequest(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.miniSession.update({ where: { id: auth.session.id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
