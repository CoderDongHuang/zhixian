import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/entities";
import { prisma } from "@/lib/prisma";
import { EntityMergeForm } from "./merge-form";

export const dynamic = "force-dynamic";
export default async function AdminEntitiesPage() {
  const user = await getCurrentUser(); if (!isAdminEmail(user?.email)) notFound();
  const entities = await prisma.entity.findMany({ select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }], take: 500 });
  return <main className="library-shell"><header><a href="/entities">返回实体档案</a><h1>实体合并</h1><p>将重复实体的别名、提及、关系和向量迁移到保留实体，并记录审计信息。</p></header><EntityMergeForm entities={entities} /></main>;
}
