import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    return Response.json({ ok: true, database: "ok", latencyMs, timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store", "Server-Timing": `db;dur=${latencyMs}` } });
  } catch {
    const latencyMs = Date.now() - started;
    return Response.json({ ok: false, database: "error", latencyMs, timestamp: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store", "Server-Timing": `db;dur=${latencyMs}` } });
  }
}
