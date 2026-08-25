import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanOptionalText, isResearchItemType, RESEARCH_NOTE_MAX } from "@/lib/research-policy";
import { resolveResearchTarget } from "@/lib/research";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id: collectionId } = await params;
  const body = await request.json().catch(() => null);
  const targetId = typeof body?.targetId === "string" ? body.targetId.trim().slice(0, 200) : "";
  if (!isResearchItemType(body?.targetType) || !targetId) return Response.json({ error: "研究对象无效" }, { status: 400 });
  const [collection, target] = await Promise.all([
    prisma.researchCollection.findFirst({ where: { id: collectionId, userId: user.id }, select: { id: true } }),
    resolveResearchTarget(body.targetType, targetId),
  ]);
  if (!collection) return Response.json({ error: "专题不存在" }, { status: 404 });
  if (!target) return Response.json({ error: "研究对象不存在或尚未发布" }, { status: 404 });
  const item = await prisma.researchCollectionItem.upsert({
    where: { collectionId_targetType_targetId: { collectionId, targetType: body.targetType, targetId } },
    update: { targetTitle: target.title, note: cleanOptionalText(body?.note, RESEARCH_NOTE_MAX) },
    create: { collectionId, targetType: body.targetType, targetId, targetTitle: target.title, note: cleanOptionalText(body?.note, RESEARCH_NOTE_MAX) },
  });
  return Response.json({ ok: true, item }, { status: 201 });
}
