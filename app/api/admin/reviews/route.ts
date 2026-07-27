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
  const analysis = await prisma.analysis.update({ where: { id: body.id }, data: { status: body.status } });
  if (!contentType.includes("application/json")) return Response.redirect(new URL("/admin/reviews", request.url), 303);
  return Response.json({ ok: true, id: analysis.id, status: analysis.status });
}
