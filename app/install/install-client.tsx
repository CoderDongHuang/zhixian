"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInstallation } from "../pwa-registration";
import { detectPlatform, platforms, type PlatformId } from "./platforms";
import { PlatformIcon } from "./platform-icon";
import releaseData from "./android-release.json";
import { getAndroidRelease } from "../../lib/android-release";

const androidRelease = getAndroidRelease(releaseData);

export function InstallClient() {
  const installation = useInstallation();
  const [detected, setDetected] = useState<PlatformId | null>(null);
  const [selected, setSelected] = useState<PlatformId | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const guideHeading = useRef<HTMLHeadingElement>(null);
  const current = platforms.find(platform => platform.id === selected);
  // A browser prompt installs on this device, never the manually selected remote platform.
  const canPrompt = installation.available && !!detected && selected === detected && detected !== "ios" && !embedded;

  useEffect(() => {
    const device = detectPlatform(navigator);
    setDetected(device);
    setSelected(device);
    setEmbedded(/MicroMessenger|QQ\/|FBAN|FBAV|Instagram/i.test(navigator.userAgent));
  }, []);

  function showGuide(platform: PlatformId | null = selected) {
    setSelected(platform);
    guideHeading.current?.focus();
  }

  return <main className="install-shell">
    <section className="install-hero" aria-labelledby="install-title">
      <div className="install-intro">
        <p className="eyebrow">知线 · 随时随地</p>
        <h1 id="install-title">把知线，<br />带到你的设备上。</h1>
        <p className="install-lead">在电脑上专注研究，在手机上随手阅读。<br className="install-desktop-break" />选择适合你的方式，让行业变化触手可及。</p>
        <div className="install-hero-actions"><a className="install-button" href="#platforms">选择你的设备 <span aria-hidden="true">↓</span></a><Link className="install-text-link" href="/">继续使用网页版 <span aria-hidden="true">↗</span></Link></div>
        <p className="install-intro-note"><span aria-hidden="true">✓</span> 网页版应用现已可用 <span aria-hidden="true">·</span> 无需下载独立安装包</p>
      </div>
      <aside className="install-recommendation" aria-label="当前设备推荐">
        <Image className="install-brand-icon" src="/brand-mark.svg" alt="" width={64} height={64} priority />
        <span className="install-availability">{installation.installed ? "正在使用网页版应用" : "网页版应用"}</span>
        <h2>{detected ? `知线 for ${platforms.find(platform => platform.id === detected)?.name}` : "你的设备，你的知线"}</h2>
        <p>{installation.installed ? "从设备的应用入口打开，继续你的阅读与研究。" : detected ? "根据当前设备推荐，通过浏览器安装并独立打开。" : "选择下方的平台，查看适合你的安装方法。"}</p>
        {installation.installed ? <Link className="install-button" href="/">继续使用知线 <span aria-hidden="true">→</span></Link>
          : <button className="install-button" type="button" disabled={installation.busy} onClick={() => {
            if (installation.available && detected && detected !== "ios" && !embedded) void installation.install();
            else showGuide(detected);
          }}>{installation.busy ? "正在打开安装窗口…" : installation.available && detected && detected !== "ios" && !embedded ? "安装网页版" : "查看安装方法"}<span aria-hidden="true">{installation.available ? "↓" : "→"}</span></button>}
        {detected === "android" && androidRelease ? <Link className="install-text-link" href="/install/android">下载 Android 测试版 ↓</Link> : <small>原生客户端将分平台陆续提供</small>}
      </aside>
    </section>

    <section className="install-platforms" id="platforms" aria-labelledby="platforms-title">
      <div className="install-section-heading"><div><p className="eyebrow">适合每一种设备</p><h2 id="platforms-title">选择你的平台</h2></div><p>现在安装网页版，客户端发布后在这里下载。</p></div>
      {([ ["desktop", "电脑端"], ["mobile", "手机与平板"] ] as const).map(([device, label]) => <div className="install-platform-group" key={device}>
        <h3>{label}</h3>
        <div className={`install-platform-grid install-platform-grid-${device}`}>
          {platforms.filter(platform => platform.device === device).map(platform => <article className="install-platform-card" data-selected={selected === platform.id || undefined} key={platform.id}>
            <div className="install-platform-top"><span className="install-platform-icon"><PlatformIcon platform={platform.id} /></span>{detected === platform.id && <span className="install-device-tag">当前设备</span>}</div>
            <h4>{platform.name}</h4><p>{platform.subtitle}</p>
            <button className="install-platform-action" type="button" aria-pressed={selected === platform.id} aria-controls="install-guide" onClick={() => showGuide(platform.id)}>查看{platform.name}安装方法 <span aria-hidden="true">→</span></button>
            {platform.id === "android" && androidRelease ? <Link className="install-platform-action" href="/install/android">下载 Android 测试版 <span aria-hidden="true">↓</span></Link> : <small>{platform.native.status === "planned" ? "桌面客户端规划中" : "原生客户端待发布"}</small>}
          </article>)}
        </div>
      </div>)}
    </section>

    <section className="install-guide" id="install-guide" aria-labelledby="guide-title">
      <div className="install-guide-intro"><p className="eyebrow">几步即可开始</p><h2 id="guide-title" ref={guideHeading} tabIndex={-1}>{current ? `${current.name} 安装指南` : "选择设备，开始安装"}</h2><p>安装的是通过浏览器添加的网页版应用。<br />各系统的菜单文字可能略有不同。</p><label htmlFor="install-platform-select">切换设备</label><select id="install-platform-select" value={selected || ""} onChange={event => setSelected(event.target.value as PlatformId || null)}><option value="">请选择设备</option>{platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></div>
      <div className="install-guide-body">
        {embedded && <p className="install-browser-notice" role="note">当前可能是内置浏览器。请通过菜单选择在系统浏览器中打开，再按以下方法安装。</p>}
        {current ? <>
          <p className="install-browser-label">{current.browser}</p>
          <ol className="install-steps">{current.steps.map((step, index) => <li key={step}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
          <p className="install-guide-note">{current.id === "android" && androidRelease ? <>也可下载<Link href="/install/android">Android 原生测试版</Link>，功能和升级方式见下载页。</> : current.note}</p>
          {!installation.installed && <div className="install-guide-actions">{(canPrompt || installation.busy) && <button type="button" className="install-button" disabled={installation.busy} onClick={() => void installation.install()}>{installation.busy ? "正在打开安装窗口…" : "安装网页版"}</button>}<Link href="/">继续使用网页版 ↗</Link></div>}
          <details className="install-uninstall"><summary>如何卸载 {current.name} 上的知线？</summary><p>{current.uninstall}</p></details>
        </> : <p className="install-guide-placeholder">从上方卡片或设备列表选择设备，即可查看对应的安装步骤。</p>}
        <p className="install-status" role="status" aria-live="polite">{installation.message}</p>
      </div>
    </section>

    <section className="install-faq" aria-labelledby="faq-title"><div className="install-section-heading"><div><p className="eyebrow">你可能想了解</p><h2 id="faq-title">关于安装</h2></div></div>
      <details><summary>现在可以下载哪些版本？<span aria-hidden="true">＋</span></summary><p>{androidRelease ? <>目前提供<Link href="/install/android">Android 测试版 APK</Link>及网页版安装方法。苹果原生客户端尚未发布，独立电脑客户端仍在规划中。</> : "目前提供网页版应用的安装方式，覆盖支持的电脑、手机和平板浏览器。Android 与苹果原生客户端尚未发布，独立电脑客户端仍在规划中；真实安装包就绪后，会在本页开放对应入口。"}</p></details>
      <details><summary>网页版应用和原生客户端有什么区别？<span aria-hidden="true">＋</span></summary><p>网页版应用通过浏览器安装，可从设备入口独立打开，主要功能随网站更新。原生客户端使用系统安装包或应用商店分发，各端的后台、离线和系统能力以实际发布内容为准。部分浏览器只能添加普通网页快捷方式。</p></details>
      <details><summary>换一台设备，收藏和学习记录还在吗？<span aria-hidden="true">＋</span></summary><p>登录同一账号后，已支持的收藏、阅读与学习数据按现有同步规则同步。本地离线缓存、系统权限和部分设备设置需要在各设备分别管理。</p></details>
      <details><summary>为什么看不到直接安装的按钮？<span aria-hidden="true">＋</span></summary><p>浏览器可能不支持直接安装、尚未提供安装提示，或你正在应用窗口中使用。iPhone/iPad 请使用 Safari 的分享菜单添加到主屏幕。其他设备可按上方指南操作、更新浏览器，或继续使用网页版。</p></details>
      <details><summary>安装后如何更新和清理缓存？<span aria-hidden="true">＋</span></summary><p>网页版随站点更新，缓存可能影响更新生效时间。联网时可到<Link href="/settings">应用设置</Link>刷新本机网页缓存。{androidRelease ? <>Android 测试版请查看<Link href="/install/android">下载页的覆盖升级说明</Link>。</> : "原生客户端发布后会提供相应的升级说明。"}各平台的卸载方法见上方安装指南。</p></details>
    </section>
    <footer className="install-footer"><Image src="/brand-mark.svg" alt="" width={24} height={24} /><span>知线 · AI 行业研究助手</span><Link href="/privacy">隐私政策 ↗</Link></footer>
  </main>;
}
