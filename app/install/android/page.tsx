import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import releaseData from "../android-release.json";
import { getAndroidRelease } from "../../../lib/android-release";

export const metadata: Metadata = { title: "Android 测试版 · 安装知线", description: "知线 Android 测试版的下载、安装、升级与校验说明。" };

export default function AndroidDownloadPage() {
  const release = getAndroidRelease(releaseData);
  return <main className="install-shell">
    <p className="eyebrow">知线 · Android</p>
    <h1>Android 测试版</h1>
    <p className="install-lead">原生客户端提供阅读、收藏、离线与学习同步。完整研究工作台请继续使用网页版。</p>
    <figure className="android-install-qr"><Image src="/android-install-qr.svg" alt="手机扫码打开知线 Android 安装页" width={160} height={160} /><figcaption>手机扫码打开本页，查看最新安装状态。</figcaption></figure>
    {release ? <section className="android-download" aria-labelledby="android-download-title">
      <h2 id="android-download-title">下载 Android 测试版</h2>
      <p>这是公开测试包，尚未在应用商店正式发行。下载完成后，需要在手机上确认安装。</p>
      <a className="install-button" href={release.downloadUrl}>下载 Android 测试版（APK） ↓</a>
      <dl><dt>版本</dt><dd>{release.version} · 构建 {release.versionCode}</dd><dt>安装包大小</dt><dd>{(release.sizeBytes / 1024 / 1024).toFixed(1)} MB</dd><dt>最低系统要求</dt><dd>Android API {release.minSdk} 及以上</dd><dt>处理器架构</dt><dd>{release.architectures.join(" / ")}</dd><dt>验证日期</dt><dd>{release.verifiedAt.slice(0, 10)}</dd><dt>SHA-256</dt><dd><code>{release.sha256}</code></dd><dt>签名证书 SHA-256</dt><dd><code>{release.certificateSha256}</code></dd></dl>
      <p><a href={release.notesUrl}>更新说明与历史安装包 ↗</a></p>
      <h3>安装与更新</h3>
      <ol><li>在安卓手机浏览器下载 APK，打开系统下载列表中的文件。</li><li>如果系统提示，请仅为本次使用的浏览器或文件管理器允许安装应用，完成后可关闭该权限。</li><li>按系统提示完成安装。升级时直接安装新版本，保留已有应用；卸载会移除本地离线内容与设备设置。</li></ol>
      <p>若出现签名冲突或版本降级提示，请停止安装并查看更新说明，避免为了升级而先卸载丢失本地数据。</p>
    </section> : <section className="android-download" aria-labelledby="android-download-title">
      <h2 id="android-download-title">测试包准备中</h2>
      <p>签名构建与设备验证完成后，这里会开放真实 APK 下载。现在可以通过浏览器安装网页版。</p>
    </section>}
    <p className="install-hero-actions"><Link className="install-button" href="/install#install-guide">查看网页版安装方法 →</Link><Link href="/install">返回全部平台</Link></p>
    <p><Link href="/privacy">隐私政策</Link></p>
  </main>;
}
