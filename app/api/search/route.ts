import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return Response.json({ items: [] });
  const entities = await prisma.entity.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }] }, select: { id: true, name: true, type: true, description: true }, orderBy: { updatedAt: "desc" }, take: 10 });
  const embedding = await fetch(process.env.EMBEDDING_API_URL!, { method: "POST", headers: { Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.EMBEDDING_MODEL || "text-embedding-v3", input: [query], dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1024) }) });
  const payload = await embedding.json();
  if (!embedding.ok) return Response.json({ items: entities.map((entity) => ({ ...entity, kind: "entity", title: entity.name, summary: entity.description, href: `/entities/${entity.id}` })) });
  const vector = payload.data?.[0]?.embedding;
  if (!Array.isArray(vector)) return Response.json({ items: entities.map((entity) => ({ ...entity, kind: "entity", title: entity.name, summary: entity.description, href: `/entities/${entity.id}` })) });
  const vectorLiteral = `[${vector.join(",")}]`;
  const rows = await prisma.$queryRawUnsafe(`select e.id, e.title, e.topic, a.summary, a.confidence, 1 - (emb.vector <=> $1::vector) as similarity from "Embedding" emb join "RawDocument" d on d.id = emb."documentId" join "EventDocument" ed on ed."documentId" = d.id join "Event" e on e.id = ed."eventId" left join lateral (select summary, confidence from "Analysis" where "eventId" = e.id and status = 'AUTO_PUBLISHED' order by "analyzedAt" desc limit 1) a on true where a.summary is not null order by emb.vector <=> $1::vector limit 20`, vectorLiteral);
  const eventItems = (rows as { id: string; title: string; topic: string | null; summary: string; confidence: number; similarity: number }[]).map((item) => ({ ...item, kind: "event", href: `/events/${item.id}` }));
  return Response.json({ items: [...entities.map((entity) => ({ ...entity, kind: "entity", title: entity.name, summary: entity.description, href: `/entities/${entity.id}` })), ...eventItems] });
}
