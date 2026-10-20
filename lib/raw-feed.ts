import type { PrismaClient } from "@prisma/client";
import { classifyTopic } from "../scripts/content-utils.mjs";
import { freeQuotaSourceTypes } from "./free-quota-policy.mjs";

// Only material from the project's public collectors may appear here.
export const publicSourceTypes = freeQuotaSourceTypes;

export function publicSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function getRawFeed(db: PrismaClient, topic: string | null, limit = 20) {
  const documents = await db.rawDocument.findMany({
    where: { source: { type: { in: publicSourceTypes } }, ...(topic ? { OR: [{ topic }, { topic: null }] } : {}) },
    orderBy: [{ fetchedAt: "desc" }, { id: "desc" }], take: topic ? 200 : limit,
    select: { id: true, title: true, url: true, topic: true, fetchedAt: true, publishedAt: true, source: { select: { name: true, type: true } } },
  });
  return documents.flatMap(document => {
    const url = publicSourceUrl(document.url);
    const resolvedTopic = document.topic || (document.source.type === "GITHUB_API" ? "GitHub 开源项目" : classifyTopic(document.title));
    return url && (!topic || topic === resolvedTopic) ? [{ ...document, url, topic: resolvedTopic }] : [];
  }).slice(0, limit);
}

export async function getCollectionFreshness(db: PrismaClient) {
  const sources = await db.source.aggregate({ where: { type: { in: publicSourceTypes } }, _max: { lastFetchedAt: true } });
  return sources._max.lastFetchedAt;
}
