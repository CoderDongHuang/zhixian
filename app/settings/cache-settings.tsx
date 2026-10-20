"use client";

import { useRef, useState } from "react";

export function CacheSettings() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const clearing = useRef(false);

  async function clearCache() {
    if (clearing.current) return;
    if (!navigator.onLine) {
      setMessage("请联网后再刷新缓存，以便重新加载页面资源。");
      return;
    }
    clearing.current = true;
    setBusy(true);
    setMessage("");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith("zhixian-")).map(key => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.filter(registration => {
          const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
          return script === new URL("/sw.js", window.location.origin).href;
        }).map(registration => registration.unregister()));
      }
      window.location.reload();
    } catch {
      clearing.current = false;
      setMessage("缓存刷新失败，请检查网络后重试。");
      setBusy(false);
    }
  }

  return <section className="account-setting-card"><div><h2>网页缓存</h2><p>页面显示旧内容或更新未生效时，可以刷新本机的知线网页缓存。此操作会移除缓存的页面与资源，需要联网重新加载，不会删除账号和云端收藏。</p></div><div><button type="button" disabled={busy} onClick={() => void clearCache()}>{busy ? "正在刷新…" : "刷新网页缓存"}</button></div><p className="setting-message" role="status" hidden={!message}>{message}</p></section>;
}
