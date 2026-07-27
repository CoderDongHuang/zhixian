import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const preferredRegion = "dub1";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "ok", latencyMs: Date.now() - started, timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ ok: false, database: "error", latencyMs: Date.now() - started, timestamp: new Date().toISOString() }, { status: 503 });
  }
}
