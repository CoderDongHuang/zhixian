import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

export async function GET() {
  const started = Date.now();
  try {
    const [schema] = await prisma.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('public."AccountProfile"') IS NOT NULL AND to_regclass('public."AccountVerification"') IS NOT NULL AS ready`;
    const latencyMs = Date.now() - started;
    if (!schema?.ready) return Response.json({ ok: false, database: "ok", schema: "error", latencyMs, timestamp: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return Response.json({ ok: true, database: "ok", schema: "ok", latencyMs, timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store", "Server-Timing": `db;dur=${latencyMs}` } });
  } catch {
    const latencyMs = Date.now() - started;
    return Response.json({ ok: false, database: "error", latencyMs, timestamp: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store", "Server-Timing": `db;dur=${latencyMs}` } });
  }
}
