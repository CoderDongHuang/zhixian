"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const primary = [["/", "发现"], ["/trends", "趋势"], ["/research", "研究"], ["/learning", "学习"]] as const;
const secondary = [["/digests", "行业简报"], ["/search", "搜索"], ["/entities", "实体档案"], ["/relations", "关系浏览"], ["/saved", "收藏"], ["/history", "阅读历史"], ["/keywords", "关键词提醒"], ["/onboarding", "阅读偏好"], ["/privacy", "隐私政策"]] as const;

export function SiteHeader() {
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [path]);
  return <header className="site-header">
    <a className="skip-link" href="#page-content">跳到主要内容</a>
    <div className="site-header-inner">
      <Link href="/" className="site-brand" aria-label="知线首页"><span className="brand-symbol" aria-hidden="true">知</span><span>知线<small>AI 行业研究</small></span></Link>
      <nav className="primary-nav" aria-label="主导航">{primary.map(([href, label]) => <Link key={href} href={href} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}>{label}</Link>)}</nav>
      <details className="site-menu" ref={menu} onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
        <summary>更多 <span aria-hidden="true">⌄</span></summary>
        <nav aria-label="更多功能">{secondary.map(([href, label]) => <Link key={href} href={href} onClick={() => { if (menu.current) menu.current.open = false; }}>{label}</Link>)}</nav>
      </details>
    </div>
  </header>;
}
