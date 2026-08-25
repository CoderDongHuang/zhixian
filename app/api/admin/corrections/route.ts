import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/entity-policy";
import { prisma } from "@/lib/prisma";
import { cleanRequiredText, CORRECTION_RESOLUTION_MAX } from "@/lib/research-policy";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAdminEmail(user?.email)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await request.json().catch(() => null) : Object.fromEntries((await request.formData()).entries());
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status === "RESOLVED" || body?.status === "REJECTED" ? body.status : null;
  const resolution = cleanRequiredText(body?.resolution, CORRECTION_RESOLUTION_MAX);
  if (!id || !status || !resolution) return Response.json({ error: "请填写处理结论" }, { status: 400 });
  const feedback = await prisma.feedback.findFirst({ where: { id, report: { not: null }, correctionStatus: "PENDING" }, include: { feedItem: { select: { eventId: true } } } });
  if (!feedback) return Response.json({ error: "纠错反馈不存在" }, { status: 404 });
  await prisma.$transaction([
    prisma.feedback.update({ where: { id }, data: { correctionStatus: status, resolution, resolvedAt: new Date() } }),
    prisma.researchNotification.upsert({
      where: { feedbackId: id },
      update: { title: "纠错反馈已有处理结果", message: resolution, href: `/events/${feedback.feedItem.eventId}`, readAt: null },
      create: { userId: feedback.userId, feedbackId: id, title: "纠错反馈已有处理结果", message: resolution, href: `/events/${feedback.feedItem.eventId}` },
    }),
  ]);
  if (!contentType.includes("application/json")) return Response.redirect(new URL("/admin/reviews?tab=corrections", request.url), 303);
  return Response.json({ ok: true, id, status });
}
