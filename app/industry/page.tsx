import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function IndustryPage() {
  const roots = await prisma.industryNode.findMany({ where: { parentId: null }, include: { children: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } });
  return <main className="library-shell"><header><Link href="/">← 返回信息流</Link><h1>行业树</h1><p>按行业主题浏览知线持续沉淀的内容。</p></header><section className="library-list">{roots.map((root) => <article key={root.id}><h2>{root.name}</h2><div className="topic-tabs">{root.children.map((node) => <Link key={node.id} href={`/?topic=${encodeURIComponent(node.name)}`}>{node.name}</Link>)}</div></article>)}</section></main>;
}
