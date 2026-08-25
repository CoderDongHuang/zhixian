import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanOptionalText, cleanRequiredText, RESEARCH_DESCRIPTION_MAX, RESEARCH_TITLE_MAX } from "@/lib/research-policy";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const collections = await prisma.researchCollection.findMany({ where: { userId: user.id }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } });
  return Response.json({ collections });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const title = cleanRequiredText(body?.title, RESEARCH_TITLE_MAX);
  const description = cleanOptionalText(body?.description, RESEARCH_DESCRIPTION_MAX);
  if (!title) return Response.json({ error: "请输入专题名称" }, { status: 400 });
  const collection = await prisma.researchCollection.create({ data: { userId: user.id, title, description } });
  return Response.json({ ok: true, collection }, { status: 201 });
}
