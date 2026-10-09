import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { measured } from "@/lib/performance";
import { latestAnalysisOrder, publicEventWhere } from "@/lib/publication";

const feedSelect = {
  id: true,
  eventId: true,
  publishedAt: true,
  rank: true,
  event: {
    select: {
      id: true,
      title: true,
      topic: true,
      importance: true,
      analyses: {
        where: { status: "AUTO_PUBLISHED" as const },
        orderBy: latestAnalysisOrder,
        take: 1,
        select: { summary: true, whyImportant: true, confidence: true },
      },
      documents: {
        take: 1,
        select: { document: { select: { source: { select: { name: true } } } } },
      },
    },
  },
};

// Publication state must be read live: ingestion invalidates analyses outside Next.js.
export const getCachedFeed = async (topic: string | null) => measured("feed.public", () => prisma.feedItem.findMany({
    where: { event: { ...(topic ? { topic } : {}), ...publicEventWhere } },
    select: feedSelect,
    orderBy: { publishedAt: "desc" },
    take: 50,
  }));

export const getCachedDigests = unstable_cache(
  () => measured("digests.public", () => prisma.digest.findMany({
    orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, type: true, title: true, overview: true, createdAt: true },
  })),
  ["public-digests-v031"],
  { revalidate: 300, tags: ["digests"] },
);

export const getCachedEntities = unstable_cache(
  () => measured("entities.public", () => prisma.entity.findMany({
    orderBy: { updatedAt: "desc" }, take: 100,
    select: { id: true, type: true, name: true, description: true, _count: { select: { mentions: true } } },
  })),
  ["public-entities-v031"],
  { revalidate: 600, tags: ["entities"] },
);

export const getCachedTimeline = () => measured("timeline.public", () => prisma.eventTimeline.findMany({
    where: { event: publicEventWhere },
    orderBy: { occurredAt: "desc" }, take: 100,
    select: { id: true, occurredAt: true, label: true, description: true, event: { select: { id: true, title: true } } },
  }));

export const getCachedIndustryTree = unstable_cache(
  () => measured("industry.public", () => prisma.industryNode.findMany({
    where: { parentId: null },
    select: { id: true, name: true, children: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    orderBy: { sortOrder: "asc" },
  })),
  ["public-industry-v031"],
  { revalidate: 3600, tags: ["industry"] },
);

export const getCachedEntityRelations = unstable_cache(
  (relation: string) => measured("relations.entity.public", () => prisma.entityRelation.findMany({
    where: relation ? { relation } : {},
    include: { fromEntity: true, toEntity: true },
    orderBy: { confidence: "desc" },
    take: 100,
  })),
  ["public-entity-relations-v04"],
  { revalidate: 600, tags: ["relations", "entities"] },
);

export const getCachedEventRelations = (relation: string) => measured("relations.event.public", () => prisma.eventRelation.findMany({
    where: { ...(relation ? { relation } : {}), fromEvent: publicEventWhere, toEvent: publicEventWhere },
    include: { fromEvent: true, toEvent: true },
    orderBy: { confidence: "desc" },
    take: 100,
  }));

export const getCachedRelationTypes = () => measured("relations.types.public", async () => {
    const [entityTypes, eventTypes] = await Promise.all([
      prisma.entityRelation.findMany({ distinct: ["relation"], select: { relation: true }, orderBy: { relation: "asc" } }),
      prisma.eventRelation.findMany({ where: { fromEvent: publicEventWhere, toEvent: publicEventWhere }, distinct: ["relation"], select: { relation: true }, orderBy: { relation: "asc" } }),
    ]);
    return { entityTypes, eventTypes };
  });
