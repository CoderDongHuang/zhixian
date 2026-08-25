import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const result = await prisma.researchNotification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  if (!result.count) return Response.json({ error: "通知不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
