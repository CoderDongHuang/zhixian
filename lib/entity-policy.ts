export const normalizeEntityName = (value: string) => value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");

export function isAdminEmail(email?: string | null) {
  return Boolean(email && (process.env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).includes(email.toLowerCase()));
}

export type RelationInput = { fromEntityId: string; toEntityId: string; relation: string; confidence: number; evidence?: string | null; sourceUrl?: string | null };
export function remapEntityRelations(relations: RelationInput[], sourceId: string, targetId: string) {
  const unique = new Map<string, RelationInput>();
  for (const item of relations) {
    const relation = { ...item, fromEntityId: item.fromEntityId === sourceId ? targetId : item.fromEntityId, toEntityId: item.toEntityId === sourceId ? targetId : item.toEntityId };
    if (relation.fromEntityId === relation.toEntityId) continue;
    const key = `${relation.fromEntityId}:${relation.toEntityId}:${relation.relation}`;
    const existing = unique.get(key);
    if (!existing || existing.confidence < relation.confidence) unique.set(key, relation);
  }
  return [...unique.values()];
}

export function sortEntityTimeline<T extends { occurredAt: Date }>(items: T[]) {
  return [...items].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
