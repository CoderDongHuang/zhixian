import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEntityName, remapEntityRelations } from "@/lib/entity-policy";
export { isAdminEmail } from "@/lib/entity-policy";

export async function mergeEntities(sourceId: string, targetId: string, mergedByUserId: string, reason?: string) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("Source and target must be different entities");
  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.entity.findUnique({ where: { id: sourceId }, include: { aliases: true, mentions: true, outgoingRelations: true, incomingRelations: true } }),
      tx.entity.findUnique({ where: { id: targetId }, select: { id: true, type: true, name: true } }),
    ]);
    if (!source || !target) throw new Error("Entity not found");
    if (source.type !== target.type) throw new Error("Only entities of the same type can be merged");
    const aliases = [{ alias: source.name, normalized: normalizeEntityName(source.name) }, ...source.aliases.map((item) => ({ alias: item.alias, normalized: normalizeEntityName(item.alias) }))];
    await tx.entityAlias.createMany({ data: aliases.map((item) => ({ entityId: target.id, ...item })), skipDuplicates: true });
    for (const mention of source.mentions) {
      const duplicate = await tx.entityMention.findUnique({ where: { entityId_eventId: { entityId: target.id, eventId: mention.eventId } } });
      if (duplicate) await tx.entityMention.delete({ where: { entityId_eventId: { entityId: source.id, eventId: mention.eventId } } });
      else await tx.entityMention.update({ where: { entityId_eventId: { entityId: source.id, eventId: mention.eventId } }, data: { entityId: target.id } });
    }
    const relations = remapEntityRelations([...source.outgoingRelations, ...source.incomingRelations], source.id, target.id);
    await tx.entityRelation.deleteMany({ where: { OR: [{ fromEntityId: source.id }, { toEntityId: source.id }] } });
    for (const relation of relations) {
      await tx.entityRelation.upsert({
        where: { fromEntityId_toEntityId_relation: { fromEntityId: relation.fromEntityId, toEntityId: relation.toEntityId, relation: relation.relation } },
        update: { confidence: relation.confidence, evidence: relation.evidence, sourceUrl: relation.sourceUrl },
        create: relation,
      });
    }
    await tx.embedding.updateMany({ where: { entityId: source.id }, data: { entityId: target.id } });
    await tx.entityMerge.create({ data: { sourceEntityId: source.id, sourceName: source.name, targetEntityId: target.id, mergedByUserId, reason: reason?.slice(0, 500) } });
    await tx.entity.delete({ where: { id: source.id } });
    return { id: target.id, name: target.name, aliasesAdded: aliases.length, mentionsMoved: source.mentions.length, relationsMoved: relations.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
