import { getCurrentUser } from "@/lib/auth";
import { createResearchShare } from "@/lib/research";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const result = await createResearchShare(user.id, id);
  if (!result) return Response.json({ error: "专题不存在" }, { status: 404 });
  const url = new URL(`/research/share/${result.token}`, request.url).toString();
  return Response.json({ ok: true, id: result.share.id, version: result.share.version, expiresAt: result.share.expiresAt, url }, { status: 201 });
}
