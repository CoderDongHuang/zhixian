import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const sections = [
  { href: "/saved", title: "我的收藏", description: "回看保存的行业变化与研究线索。" },
  { href: "/history", title: "阅读历史", description: "继续阅读，找回最近关注的内容。" },
  { href: "/keywords", title: "关键词提醒", description: "管理关注的关键词和更新提醒。" },
  { href: "/onboarding", title: "阅读偏好", description: "调整关注主题、学习目标和简报推送。" },
];

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  return <main className="library-shell account-shell">
    <header><p className="eyebrow">我的账号</p><h1>个人中心</h1><p>管理你的阅读、关注与个性化设置。</p></header>
    <section className="account-profile" aria-label="账号信息">
      <span className="account-avatar" aria-hidden="true">{user.email?.charAt(0).toUpperCase() || "知"}</span>
      <div><h2>{user.email ? "登录邮箱" : "账号状态"}</h2><p>{user.email || "已通过微信登录"}</p></div>
    </section>
    <section className="account-links" aria-label="个人功能">{sections.map(section => <Link key={section.href} href={section.href}><h2>{section.title}<span aria-hidden="true">↗</span></h2><p>{section.description}</p></Link>)}</section>
    <div className="account-footer"><Link href="/privacy">隐私政策</Link><form action="/api/auth/logout" method="post"><button type="submit" className="secondary">退出登录</button></form></div>
  </main>;
}
