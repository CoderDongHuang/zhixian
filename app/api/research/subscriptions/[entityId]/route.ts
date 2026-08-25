import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { entityId } = await params;
  const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!entity) return Response.json({ error: "实体不存在" }, { status: 404 });
  const subscription = await prisma.entitySubscription.upsert({
    where: { userId_entityId: { userId: user.id, entityId } },
    update: { enabled: true },
    create: { userId: user.id, entityId },
  });
  return Response.json({ ok: true, subscription });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { entityId } = await params;
  await prisma.entitySubscription.updateMany({ where: { userId: user.id, entityId }, data: { enabled: false } });
  return Response.json({ ok: true });
}
