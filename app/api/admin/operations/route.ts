import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/entity-policy";
import { evaluateOperations, monitorAuthorized, operationalMetrics } from "@/lib/operations.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!monitorAuthorized(request.headers.get("authorization"), process.env.MONITOR_TOKEN)) {
    const user = await getCurrentUser();
    if (!isAdminEmail(user?.email)) return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return Response.json(evaluateOperations(await operationalMetrics(prisma)), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "FAILED", reasons: ["METRICS_UNAVAILABLE"] }, { status: 503 });
  }
}
