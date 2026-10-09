import type { Prisma } from "@prisma/client";

// The database projects latest status + inputRevision atomically, including script writes.
export const publicEventWhere = { isPublic: true } satisfies Prisma.EventWhereInput;
export const latestAnalysisOrder = [{ analyzedAt: "desc" }, { id: "desc" }] satisfies Prisma.AnalysisOrderByWithRelationInput[];
