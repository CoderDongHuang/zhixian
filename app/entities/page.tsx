import Link from "next/link";
import { getCachedEntities } from "@/lib/public-data";

export const dynamic = "force-dynamic";
const typeLabels: Record<string, string> = { COMPANY: "公司", PERSON: "人物", PRODUCT: "产品", TECHNOLOGY: "技术", OPEN_SOURCE_PROJECT: "开源项目" };

export default async function EntitiesPage() {
  const entities = await getCachedEntities();
  return <main className="library-shell"><header><Link href="/">返回信息流</Link><h1>实体档案</h1><p>公司、人物、产品、技术和开源项目的持续记录。</p></header><nav className="subnav"><Link href="/relations">关系浏览</Link><Link href="/search">搜索</Link></nav><section className="library-list">{entities.length === 0 ? <p className="empty-state">实体档案会在内容处理后自动生成。</p> : entities.map((entity) => <article key={entity.id}><div><span>{typeLabels[entity.type] || entity.type}</span><span>{entity._count.mentions} 次关联</span></div><h2><Link href={`/entities/${entity.id}`}>{entity.name}</Link></h2><p>{entity.description || "暂无描述"}</p></article>)}</section></main>;
}
