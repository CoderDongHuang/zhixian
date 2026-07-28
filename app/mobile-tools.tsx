"use client";

import { useEffect, useState } from "react";

function fromBase64Url(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function MobileTools({ publicKey, signedIn }: { publicKey: string; signedIn: boolean }) {
  const [pushOn, setPushOn] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { navigator.serviceWorker?.ready.then((registration) => registration.pushManager.getSubscription()).then((value) => setPushOn(Boolean(value))); }, []);
  async function togglePush() {
    if (!signedIn) return setMessage("登录后可同步推送设置");
    if (!publicKey) return setMessage("管理员尚未配置推送密钥");
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
      await existing.unsubscribe(); setPushOn(false); setMessage("推送已关闭"); return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setMessage("未获得通知权限");
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) });
    const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
    setPushOn(response.ok); setMessage(response.ok ? "推送已开启" : "推送订阅失败");
  }
  return <div className="mobile-tools"><button className="secondary" type="button" onClick={togglePush}>{pushOn ? "关闭推送" : "开启推送"}</button>{message && <small>{message}</small>}</div>;
}
