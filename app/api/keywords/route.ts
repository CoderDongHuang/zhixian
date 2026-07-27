import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await prisma.keywordSubscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await request.json() as { keyword?: string; realtime?: boolean } : Object.fromEntries((await request.formData()).entries()) as { keyword?: string; realtime?: boolean };
  const keyword = body.keyword?.trim();
  if (!keyword || keyword.length > 100) return Response.json({ error: "Invalid keyword" }, { status: 400 });
  const normalized = keyword.toLowerCase();
  const result = await prisma.keywordSubscription.upsert({ where: { userId_normalized: { userId: user.id, normalized } }, update: { enabled: true, realtime: body.realtime !== false }, create: { userId: user.id, keyword, normalized, realtime: body.realtime !== false } });
  return Response.json(result, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  await prisma.keywordSubscription.deleteMany({ where: { id, userId: user.id } });
  return Response.json({ ok: true });
}
