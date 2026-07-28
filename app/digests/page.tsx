import Link from "next/link";
import { getCachedDigests } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";
const labels = { MORNING: "早报", EVENING: "晚报", WEEKLY: "周报" } as const;

export default async function DigestsPage() {
  const digests = await getCachedDigests();
  return <main className="library-shell"><header><Link href="/">← 返回信息流</Link><h1>行业简报</h1><p>早晚精选与每周行业变化汇总</p></header><section className="library-list">{digests.length === 0 ? <p className="empty-state">简报尚未生成。</p> : digests.map((digest) => <article key={digest.id}><div><span>{labels[digest.type]}</span><span>{digest.createdAt.toLocaleString("zh-CN", { hour12: false })}</span></div><h2><Link href={`/digests/${digest.id}`}>{digest.title}</Link></h2><p>{digest.overview}</p></article>)}</section></main>;
}
