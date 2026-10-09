import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  hashResearchShareToken,
  RESEARCH_SHARE_TTL_DAYS,
  researchTargetHref,
  type ResearchItemTypeValue,
} from "@/lib/research-policy";

type SnapshotSource = { title: string; url: string; source: string; quote?: string; stance?: string };
export type ResearchSnapshotItem = {
  type: ResearchItemTypeValue;
  id: string;
  title: string;
  note: string | null;
  href: string;
  summary: string | null;
  updatedAt: string;
  sources: SnapshotSource[];
};
export type ResearchSnapshot = {
  title: string;
  description: string | null;
  version: number;
  generatedAt: string;
  items: ResearchSnapshotItem[];
};

export async function resolveResearchTarget(type: ResearchItemTypeValue, id: string) {
  if (type === "EVENT") {
    const event = await prisma.event.findFirst({
      where: { id, isPublic: true },
      select: { id: true, title: true, analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 1, select: { summary: true } } },
    });
    return event ? { title: event.analyses[0]?.summary || event.title } : null;
  }
  if (type === "ENTITY") {
    const entity = await prisma.entity.findUnique({ where: { id }, select: { name: true } });
    return entity ? { title: entity.name } : null;
  }
  const digest = await prisma.digest.findUnique({ where: { id }, select: { title: true } });
  return digest ? { title: digest.title } : null;
}

async function snapshotItem(type: ResearchItemTypeValue, id: string, title: string, note: string | null): Promise<ResearchSnapshotItem | null> {
  if (type === "EVENT") {
    const event = await prisma.event.findFirst({
      where: { id, isPublic: true },
      include: {
        analyses: { where: { status: "AUTO_PUBLISHED" }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }], take: 1, include: { evidence: { include: { document: { include: { source: true } } } } } },
        documents: { include: { document: { include: { source: true } } } },
      },
    });
    if (!event) return null;
    const analysis = event.analyses[0];
    const sources: SnapshotSource[] = analysis.evidence.map((evidence) => ({ title: evidence.document.title, url: evidence.document.url, source: evidence.document.source.name, quote: evidence.quote, stance: evidence.stance }));
    for (const { document } of event.documents) if (!sources.some((source) => source.url === document.url)) sources.push({ title: document.title, url: document.url, source: document.source.name });
    return { type, id, title, note, href: researchTargetHref(type, id), summary: analysis.summary, updatedAt: analysis.analyzedAt.toISOString(), sources };
  }
  if (type === "ENTITY") {
    const entity = await prisma.entity.findUnique({ where: { id }, include: { mentions: { where: { event: { isPublic: true } }, include: { document: { include: { source: true } } } } } });
    if (!entity) return null;
    const sources = entity.mentions.flatMap((mention) => mention.document ? [{ title: mention.document.title, url: mention.document.url, source: mention.document.source.name }] : []);
    return { type, id, title, note, href: researchTargetHref(type, id), summary: entity.description, updatedAt: entity.updatedAt.toISOString(), sources: [...new Map(sources.map((source) => [source.url, source])).values()] };
  }
  const digest = await prisma.digest.findUnique({ where: { id } });
  if (!digest) return null;
  return { type, id, title, note, href: researchTargetHref(type, id), summary: digest.overview, updatedAt: digest.createdAt.toISOString(), sources: [] };
}

export async function createResearchShare(userId: string, collectionId: string) {
  const collection = await prisma.researchCollection.findFirst({ where: { id: collectionId, userId }, include: { items: { orderBy: { createdAt: "asc" } }, shares: { orderBy: { version: "desc" }, take: 1 } } });
  if (!collection) return null;
  const version = (collection.shares[0]?.version || 0) + 1;
  const resolved = await Promise.all(collection.items.map((item) => snapshotItem(item.targetType, item.targetId, item.targetTitle, item.note)));
  const snapshot: ResearchSnapshot = { title: collection.title, description: collection.description, version, generatedAt: new Date().toISOString(), items: resolved.filter((item): item is ResearchSnapshotItem => Boolean(item)) };
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESEARCH_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const share = await prisma.researchShare.create({ data: { collectionId, createdById: userId, tokenHash: hashResearchShareToken(token), version, snapshot, expiresAt } });
  return { share, token };
}
