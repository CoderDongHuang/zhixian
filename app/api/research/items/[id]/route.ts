import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanOptionalText, RESEARCH_NOTE_MAX } from "@/lib/research-policy";

async function ownedItem(id: string, userId: string) {
  return prisma.researchCollectionItem.findFirst({ where: { id, collection: { userId } }, select: { id: true } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  if (!await ownedItem(id, user.id)) return Response.json({ error: "条目不存在" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const item = await prisma.researchCollectionItem.update({ where: { id }, data: { note: cleanOptionalText(body?.note, RESEARCH_NOTE_MAX) } });
  return Response.json({ ok: true, item });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  if (!await ownedItem(id, user.id)) return Response.json({ error: "条目不存在" }, { status: 404 });
  await prisma.researchCollectionItem.delete({ where: { id } });
  return Response.json({ ok: true });
}
