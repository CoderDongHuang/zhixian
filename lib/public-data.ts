import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { measured } from "@/lib/performance";

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
        orderBy: { analyzedAt: "desc" as const },
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

export const getCachedFeed = unstable_cache(
  async (topic: string | null) => measured("feed.public", () => prisma.feedItem.findMany({
    where: topic ? { event: { topic } } : undefined,
    select: feedSelect,
    orderBy: { publishedAt: "desc" },
    take: 50,
  })),
  ["public-feed-v031"],
  { revalidate: 180, tags: ["feed"] },
);

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

export const getCachedTimeline = unstable_cache(
  () => measured("timeline.public", () => prisma.eventTimeline.findMany({
    orderBy: { occurredAt: "desc" }, take: 100,
    select: { id: true, occurredAt: true, label: true, description: true, event: { select: { id: true, title: true } } },
  })),
  ["public-timeline-v031"],
  { revalidate: 600, tags: ["timeline"] },
);

export const getCachedIndustryTree = unstable_cache(
  () => measured("industry.public", () => prisma.industryNode.findMany({
    where: { parentId: null },
    select: { id: true, name: true, children: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    orderBy: { sortOrder: "asc" },
  })),
  ["public-industry-v031"],
  { revalidate: 3600, tags: ["industry"] },
);
