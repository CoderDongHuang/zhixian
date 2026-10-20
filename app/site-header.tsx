"use client";

import Link from "next/link";
import Image from "next/image";
import { AccountAvatar } from "./account-avatar";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const navigation = [
  { label: "发现", links: [["/", "发现首页"], ["/digests", "行业简报"], ["/search", "搜索"]] },
  { label: "趋势", href: "/trends" },
  { label: "研究", links: [["/research", "研究工作台"], ["/entities", "实体档案"], ["/relations", "关系浏览"]] },
  { label: "学习", href: "/learning" },
  { label: "阅读", links: [["/saved", "收藏"], ["/history", "阅读历史"], ["/keywords", "关键词提醒"]] },
  { label: "设置", links: [["/onboarding", "阅读偏好"], ["/settings", "应用设置"], ["/privacy", "隐私政策"]] },
  { label: "安装知线", href: "/install" },
] as const;

export function SiteHeader({ user }: { user: { id: string; email: string | null } | null }) {
  const path = usePathname();
  const header = useRef<HTMLElement>(null);
  const isCurrent = (href: string) => href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

  function closeMenus(except?: HTMLDetailsElement) {
    header.current?.querySelectorAll("details[open]").forEach(menu => {
      if (menu !== except) (menu as HTMLDetailsElement).open = false;
    });
  }

  useEffect(() => { closeMenus(); }, [path]);
  useEffect(() => {
    function closeOutside(event: Event) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) closeMenus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, []);

  return <header className="site-header" ref={header} onKeyDown={event => {
    if (event.key === "Escape") {
      const menu = header.current?.querySelector<HTMLDetailsElement>("details[open]");
      closeMenus();
      menu?.querySelector("summary")?.focus();
    }
  }}>
    <a className="skip-link" href="#page-content">跳到主要内容</a>
    <div className="site-header-inner">
      <Link href="/" className="site-brand" aria-label="知线首页" onClick={() => closeMenus()}><Image className="brand-symbol" src="/brand-mark.svg" alt="" width={40} height={40} priority /><span>知线<small>AI 行业研究</small></span></Link>
      <nav className="primary-nav" aria-label="主导航">
        {navigation.map(item => "href" in item
          ? <Link key={item.label} href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined} onClick={() => closeMenus()}>{item.label}</Link>
          : <details key={item.label} className="site-menu nav-menu" onToggle={event => { if (event.currentTarget.open) closeMenus(event.currentTarget); }}>
            <summary data-active={item.links.some(([href]) => isCurrent(href)) || undefined}>{item.label}<span className="menu-chevron" aria-hidden="true">⌄</span></summary>
            <div className="site-dropdown" aria-label={`${item.label}功能`}>
              {item.links.map(([href, label]) => <Link key={href} href={href} aria-current={isCurrent(href) ? "page" : undefined} onClick={() => closeMenus()}>{label}</Link>)}
            </div>
          </details>)}
      </nav>
      <details className="site-menu account-menu" onToggle={event => { if (event.currentTarget.open) closeMenus(event.currentTarget); }}>
        <summary className="avatar-trigger" aria-label="用户菜单" title={user?.email || "用户菜单"}>
          {user ? <AccountAvatar key={user.id} userId={user.id} email={user.email} /> : <span className="account-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg></span>}
          <span className="menu-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="site-dropdown account-dropdown">
          <div className="account-menu-heading"><strong>{user ? "我的账号" : "欢迎来到知线"}</strong><span>{user ? user.email || "已登录" : "登录后同步你的阅读与研究"}</span></div>
          <Link href="/account" aria-current={isCurrent("/account") ? "page" : undefined} onClick={() => closeMenus()}>个人中心<span aria-hidden="true">↗</span></Link>
          {user ? <form action="/api/auth/logout" method="post"><button type="submit" className="logout-button">退出登录</button></form> : <Link href="/login" onClick={() => closeMenus()}>登录 / 注册<span aria-hidden="true">→</span></Link>}
        </div>
      </details>
    </div>
  </header>;
}
