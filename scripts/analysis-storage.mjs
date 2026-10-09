import { normalizeEvidenceCandidates } from "../lib/evidence-policy.mjs";

export function analysisManifest(event) {
  return event.documents.map(({ document }) => ({
    id: document.id, revision: document.materialRevision, contentHash: document.contentHash,
    title: document.title, url: document.url, source: document.source.name,
    publishedAt: document.publishedAt?.toISOString() ?? null,
    content: (document.cleanedContent || document.content || "").slice(0, 9000),
    translation: (document.translatedContent || "").slice(0, 9000),
  }));
}

export async function saveCurrentAnalysis(prisma, event, data, candidates, importance) {
  return prisma.$transaction(async (tx) => {
    const [current] = await tx.$queryRaw`SELECT "materialRevision" FROM "Event" WHERE id = ${event.id} FOR UPDATE`;
    if (!current || current.materialRevision !== event.materialRevision) return null;
    if (await tx.analysis.count({ where: { eventId: event.id, status: { not: "STALE" } } })) return null;
    const manifest = analysisManifest(event);
    const created = await tx.analysis.create({ data: {
      ...data, eventId: event.id, inputRevision: event.materialRevision, inputManifest: manifest,
      evidence: { create: normalizeEvidenceCandidates(candidates).flatMap((candidate) => {
        const matching = manifest.find((document) => document.content.includes(candidate.quote));
        return matching ? [{ documentId: matching.id, quote: candidate.quote, stance: candidate.stance }] : [];
      }) },
    } });
    await tx.event.update({ where: { id: event.id }, data: { importance } });
    if (data.status === "AUTO_PUBLISHED") {
      const existing = await tx.feedItem.findFirst({ where: { eventId: event.id } });
      if (existing) await tx.feedItem.update({ where: { id: existing.id }, data: { rank: importance * data.confidence } });
      else await tx.feedItem.create({ data: { eventId: event.id, rank: importance * data.confidence } });
    }
    return created;
  });
}
