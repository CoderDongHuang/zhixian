import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SearchClient } from "./search-client";

export default async function SearchPage() {
  const user = await getCurrentUser(); if (!user) redirect("/login?next=/search");
  return <main className="library-shell"><header><Link href="/">返回信息流</Link><h1>全站搜索</h1><p>同时检索事件、公司、人物、产品、技术和开源项目。</p></header><SearchClient /></main>;
}
