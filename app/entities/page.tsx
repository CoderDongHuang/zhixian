import { getCachedEntities } from "@/lib/public-data";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function EntitiesPage() {
  const entities = await getCachedEntities();
  return <main className="library-shell"><header><Link href="/">← 返回信息流</Link><h1>实体档案</h1><p>公司、人物、产品、技术和开源项目的持续记录。</p></header><section className="library-list">{entities.length === 0 ? <p className="empty-state">实体档案会在内容处理后自动生成。</p> : entities.map((entity) => <article key={entity.id}><div><span>{entity.type}</span><span>{entity._count.mentions} 次关联</span></div><h2>{entity.name}</h2><p>{entity.description || "暂无描述"}</p></article>)}</section></main>;
}
