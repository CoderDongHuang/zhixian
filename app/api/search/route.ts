import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { configuredEmbeddingDimensions, validEmbeddingVector } from "@/lib/embedding-policy.mjs";
import { trackedAiFetch } from "@/lib/ai-telemetry.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return Response.json({ items: [] });
  const [entities, events] = await Promise.all([
    prisma.entity.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }] }, select: { id: true, name: true, type: true, description: true }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.$queryRaw<{ id: string; title: string; topic: string | null; summary: string; confidence: number }[]>`
      SELECT e.id, e.title, e.topic, a.summary, a.confidence FROM "Event" e
      JOIN LATERAL (SELECT summary, confidence FROM "Analysis" WHERE "eventId" = e.id ORDER BY "analyzedAt" DESC, id DESC LIMIT 1) a ON TRUE
      WHERE e."isPublic" AND (strpos(lower(e.title), lower(${query})) > 0 OR strpos(lower(a.summary), lower(${query})) > 0)
      ORDER BY e."createdAt" DESC, e.id LIMIT 20`,
  ]);
  const entityItems = entities.map((entity) => ({ ...entity, kind: "entity", title: entity.name, summary: entity.description, href: `/entities/${entity.id}` }));
  const eventItems = events.map((event) => ({ ...event, kind: "event", href: `/events/${event.id}` }));
  const textItems = [...entityItems, ...eventItems];
  if (textItems.length || !process.env.EMBEDDING_API_URL || !process.env.EMBEDDING_API_KEY) return Response.json({ items: textItems });
  let dimensions: number;
  try { dimensions = configuredEmbeddingDimensions(); } catch { return Response.json({ items: textItems }); }
  let embedding: Response;
  try { embedding = await trackedAiFetch(prisma, "search-embedding", process.env.EMBEDDING_MODEL || "text-embedding-v3")(process.env.EMBEDDING_API_URL, { method: "POST", headers: { Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.EMBEDDING_MODEL || "text-embedding-v3", input: [query], dimensions }), signal: AbortSignal.timeout(5000) }); }
  catch { return Response.json({ items: textItems }); }
  const payload = await embedding.json().catch(() => null);
  if (!embedding.ok || !payload) return Response.json({ items: textItems });
  const vector = payload.data?.[0]?.embedding;
  if (!validEmbeddingVector(vector, dimensions)) return Response.json({ items: textItems });
  const vectorLiteral = `[${vector.join(",")}]`;
  try {
    const rows = await prisma.$queryRawUnsafe(`select * from (select distinct on (e.id) e.id, e.title, e.topic, a.summary, a.confidence, 1 - (emb.vector <=> $1::vector) as similarity from "Embedding" emb join "RawDocument" d on d.id = emb."documentId" join "EventDocument" ed on ed."documentId" = d.id join "Event" e on e.id = ed."eventId" join lateral (select summary, confidence from "Analysis" where "eventId" = e.id order by "analyzedAt" desc, id desc limit 1) a on true where e."isPublic" = true and emb.model = $2 order by e.id, emb.vector <=> $1::vector) hits order by similarity desc limit 20`, vectorLiteral, process.env.EMBEDDING_MODEL || "text-embedding-v3");
    const semanticItems = (rows as { id: string; title: string; topic: string | null; summary: string; confidence: number; similarity: number }[]).sort((a, b) => b.similarity - a.similarity).slice(0, 20).map((item) => ({ ...item, kind: "event", href: `/events/${item.id}` }));
    return Response.json({ items: semanticItems });
  } catch {
    return Response.json({ items: textItems });
  }
}
