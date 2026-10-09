import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveWebPushIntent } from "@/lib/web-push-storage";

function endpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const value = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint(value)) return Response.json({ error: "订阅数据无效" }, { status: 400 });
  const registered = await prisma.deviceSubscription.count({ where: { userId: user.id, endpoint: value } }) > 0;
  return Response.json({ registered }, { headers: { "Cache-Control": "no-store" } });
}

async function save(request: Request, enabled: boolean) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const changedAt = body?.changedAt ?? Date.now();
  if (!endpoint(body?.endpoint) || !Number.isSafeInteger(changedAt) || changedAt <= 0 || changedAt > Date.now() + 60_000 ||
    (enabled && (typeof body?.keys?.p256dh !== "string" || !body.keys.p256dh || body.keys.p256dh.length > 512 || typeof body?.keys?.auth !== "string" || !body.keys.auth || body.keys.auth.length > 512)))
    return Response.json({ error: "订阅数据无效" }, { status: 400 });
  const saved = await saveWebPushIntent(prisma, user.id, { endpoint: body.endpoint, changedAt, enabled, keys: enabled ? body.keys : undefined, userAgent: request.headers.get("user-agent") });
  return saved ? Response.json({ ok: true }) : Response.json({ error: "订阅状态已更新，请重新同步" }, { status: 409 });
}

export async function POST(request: Request) { return save(request, true); }
export async function DELETE(request: Request) { return save(request, false); }
