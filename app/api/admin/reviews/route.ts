import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAdmin(email?: string | null) {
  return Boolean(email && (process.env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).includes(email.toLowerCase()));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await request.json() as { id?: string; status?: "APPROVED" | "REJECTED" } : Object.fromEntries((await request.formData()).entries()) as { id?: string; status?: "APPROVED" | "REJECTED" };
  if (!body.id || !body.status) return Response.json({ error: "Invalid review" }, { status: 400 });
  const analysis = await prisma.analysis.findUnique({ where: { id: body.id }, select: { id: true, eventId: true, confidence: true, event: { select: { importance: true } } } });
  if (!analysis) return Response.json({ error: "Review not found" }, { status: 404 });
  const status = body.status === "APPROVED" ? "AUTO_PUBLISHED" : "REJECTED";
  await prisma.$transaction(async (tx) => {
    await tx.analysis.update({ where: { id: analysis.id }, data: { status } });
    if (status === "AUTO_PUBLISHED") {
      const rank = analysis.event.importance * analysis.confidence;
      const existingFeedItem = await tx.feedItem.findFirst({ where: { eventId: analysis.eventId }, select: { id: true } });
      if (existingFeedItem) await tx.feedItem.update({ where: { id: existingFeedItem.id }, data: { rank } });
      else await tx.feedItem.create({ data: { eventId: analysis.eventId, rank } });
    } else {
      await tx.feedItem.deleteMany({ where: { eventId: analysis.eventId } });
    }
  });
  if (!contentType.includes("application/json")) return Response.redirect(new URL("/admin/reviews", request.url), 303);
  return Response.json({ ok: true, id: analysis.id, status });
}
