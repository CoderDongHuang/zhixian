import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { measured } from "@/lib/performance";

const ACTION_WEIGHTS: Record<string, number> = {
  view: 0.08,
  read: 0.35,
  listen: 0.25,
  share: 0.45,
  bookmark: 0.8,
  helpful: 0.65,
  not_helpful: -0.8,
  complete_learning: 0.7,
};

const getCachedBehavior = unstable_cache(async (userId: string) => {
  const since = new Date(Date.now() - 90 * 86400000);
  return measured("recommendations.behavior", () => prisma.behaviorEvent.findMany({
    where: { userId, topic: { not: null }, createdAt: { gte: since } },
    select: { topic: true, action: true, value: true, createdAt: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  }));
}, ["topic-affinity-events-v031"], { revalidate: 60, tags: ["recommendations"] });

export async function getTopicAffinity(userId: string) {
  const events = await getCachedBehavior(userId);
  const affinity = new Map<string, number>();
  for (const event of events) {
    if (!event.topic) continue;
    const ageDays = (Date.now() - event.createdAt.getTime()) / 86400000;
    const decay = Math.exp(-ageDays / 35);
    affinity.set(event.topic, (affinity.get(event.topic) ?? 0) + (ACTION_WEIGHTS[event.action] ?? 0.05) * event.value * decay);
  }
  const max = Math.max(1, ...affinity.values().map(Math.abs));
  return new Map([...affinity].map(([topic, value]) => [topic, value / max]));
}

export function recommendationScore(baseRank: number, topic: string | null, preferred: Set<string>, affinity: Map<string, number>) {
  const preferenceBoost = topic && preferred.has(topic) ? 0.14 : 0;
  const behaviorBoost = topic ? (affinity.get(topic) ?? 0) * 0.24 : 0;
  return Math.max(0, Math.min(1.25, baseRank + preferenceBoost + behaviorBoost));
}
