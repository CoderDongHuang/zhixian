import Link from "next/link";
import { CacheSettings } from "./cache-settings";

export const metadata = { title: "应用设置 | 知线" };

export default function SettingsPage() {
  return <main className="library-shell app-settings"><header><p className="eyebrow">设置</p><h1>应用设置</h1><p>管理此设备上的知线网页版应用。</p></header><CacheSettings /><section className="app-settings-links"><Link href="/install">安装知线 <span aria-hidden="true">→</span></Link><Link href="/onboarding">阅读偏好 <span aria-hidden="true">→</span></Link></section></main>;
}
