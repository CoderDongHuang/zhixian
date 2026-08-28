import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { configuredEmbeddingDimensions, validEmbeddingVector } from "@/lib/embedding-policy.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return Response.json({ items: [] });
  const [entities, events] = await Promise.all([
    prisma.entity.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }] }, select: { id: true, name: true, type: true, description: true }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.event.findMany({
      where: { OR: [{ title: { contains: query, mode: "insensitive" } }, { analyses: { some: { status: "AUTO_PUBLISHED", summary: { contains: query, mode: "insensitive" } } } }] },
      select: { id: true, title: true, topic: true, analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: { analyzedAt: "desc" }, take: 1, select: { summary: true, confidence: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const entityItems = entities.map((entity) => ({ ...entity, kind: "entity", title: entity.name, summary: entity.description, href: `/entities/${entity.id}` }));
  const eventItems = events.map((event) => ({ id: event.id, title: event.title, topic: event.topic, summary: event.analyses[0]?.summary || null, confidence: event.analyses[0]?.confidence || null, kind: "event", href: `/events/${event.id}` }));
  const textItems = [...entityItems, ...eventItems];
  if (textItems.length || !process.env.EMBEDDING_API_URL || !process.env.EMBEDDING_API_KEY) return Response.json({ items: textItems });
  let dimensions: number;
  try { dimensions = configuredEmbeddingDimensions(); } catch { return Response.json({ items: textItems }); }
  let embedding: Response;
  try { embedding = await fetch(process.env.EMBEDDING_API_URL, { method: "POST", headers: { Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.EMBEDDING_MODEL || "text-embedding-v3", input: [query], dimensions }), signal: AbortSignal.timeout(5000) }); }
  catch { return Response.json({ items: textItems }); }
  const payload = await embedding.json().catch(() => null);
  if (!embedding.ok || !payload) return Response.json({ items: textItems });
  const vector = payload.data?.[0]?.embedding;
  if (!validEmbeddingVector(vector, dimensions)) return Response.json({ items: textItems });
  const vectorLiteral = `[${vector.join(",")}]`;
  try {
    const rows = await prisma.$queryRawUnsafe(`select e.id, e.title, e.topic, a.summary, a.confidence, 1 - (emb.vector <=> $1::vector) as similarity from "Embedding" emb join "RawDocument" d on d.id = emb."documentId" join "EventDocument" ed on ed."documentId" = d.id join "Event" e on e.id = ed."eventId" left join lateral (select summary, confidence from "Analysis" where "eventId" = e.id and status = 'AUTO_PUBLISHED' order by "analyzedAt" desc limit 1) a on true where a.summary is not null order by emb.vector <=> $1::vector limit 20`, vectorLiteral);
    const semanticItems = (rows as { id: string; title: string; topic: string | null; summary: string; confidence: number; similarity: number }[]).map((item) => ({ ...item, kind: "event", href: `/events/${item.id}` }));
    return Response.json({ items: semanticItems });
  } catch {
    return Response.json({ items: textItems });
  }
}
