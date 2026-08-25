import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanOptionalText, cleanRequiredText, RESEARCH_DESCRIPTION_MAX, RESEARCH_TITLE_MAX } from "@/lib/research-policy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title = cleanRequiredText(body?.title, RESEARCH_TITLE_MAX);
  if (!title) return Response.json({ error: "请输入专题名称" }, { status: 400 });
  const result = await prisma.researchCollection.updateMany({ where: { id, userId: user.id }, data: { title, description: cleanOptionalText(body?.description, RESEARCH_DESCRIPTION_MAX) } });
  if (!result.count) return Response.json({ error: "专题不存在" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const result = await prisma.researchCollection.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) return Response.json({ error: "专题不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
