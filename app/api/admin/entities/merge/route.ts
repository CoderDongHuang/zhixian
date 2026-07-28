import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail, mergeEntities } from "@/lib/entities";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.sourceId !== "string" || typeof body?.targetId !== "string") return Response.json({ error: "Invalid merge request" }, { status: 400 });
  try {
    const result = await mergeEntities(body.sourceId, body.targetId, user.id, typeof body.reason === "string" ? body.reason : undefined);
    return Response.json({ ok: true, entity: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Merge failed" }, { status: 409 });
  }
}
