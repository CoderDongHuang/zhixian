import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ResearchSnapshot } from "@/lib/research";
import { hashResearchShareToken } from "@/lib/research-policy";

export const dynamic = "force-dynamic";

export default async function SharedResearch({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) notFound();
  const share = await prisma.researchShare.findUnique({ where: { tokenHash: hashResearchShareToken(token) } });
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt <= new Date())) notFound();
  const snapshot = share.snapshot as unknown as ResearchSnapshot;
  if (!snapshot || !Array.isArray(snapshot.items) || typeof snapshot.title !== "string") notFound();
  return <main className="shared-research"><header><p className="eyebrow">知线研究分享</p><h1>{snapshot.title}</h1><p>{snapshot.description}</p><div><span>只读版本 {snapshot.version}</span><span>生成于 {new Date(snapshot.generatedAt).toLocaleString("zh-CN", { hour12: false })}</span><span>链接有效至 {share.expiresAt?.toLocaleDateString("zh-CN")}</span></div></header><section>{snapshot.items.map((item, index) => <article key={`${item.type}-${item.id}`}><div className="feed-meta"><span>{item.type === "EVENT" ? "事件" : item.type === "ENTITY" ? "实体" : "简报"}</span><span>材料更新于 {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span></div><h2>{index + 1}. {item.title}</h2>{item.summary && <p>{item.summary}</p>}{item.note && <aside><strong>研究笔记</strong><p>{item.note}</p></aside>}{item.sources.length > 0 && <div className="shared-sources"><h3>来源与证据</h3>{item.sources.map((source, sourceIndex) => <div key={`${source.url}-${sourceIndex}`}><a href={source.url} target="_blank" rel="noreferrer">{source.source}：{source.title}</a>{source.quote && <blockquote data-stance={source.stance}>{source.quote}</blockquote>}</div>)}</div>}</article>)}</section><footer>此页面是生成时冻结的研究快照。来源内容可能在发布后发生变化。</footer></main>;
}
