import Link from "next/link";
import Image from "next/image";

export default function OfflinePage() {
  return <main className="offline-page"><Image src="/icon-192.png" width={88} height={88} alt="知线" /><h1>当前无法连接网络</h1><p>网络恢复后即可继续查看最新行业信息。已打开过的静态资源仍可由设备缓存提供。</p><Link href="/">重新连接</Link></main>;
}
