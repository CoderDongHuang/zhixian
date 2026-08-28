"use client";

import { useEffect, useState } from "react";

const PUSH_TIMEOUT_MS = 15_000;

function fromBase64Url(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function withTimeout<T>(promise: Promise<T>, message: string) {
  let timeoutId = 0;
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error(message)), PUSH_TIMEOUT_MS); }),
  ]).finally(() => window.clearTimeout(timeoutId));
}

function pushErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "通知权限被拒绝，请在浏览器设置中允许后重试";
  if (error instanceof Error && /permission denied/i.test(error.message)) return "浏览器推送服务拒绝注册，请检查 Edge 通知和系统权限";
  if (error instanceof Error && error.message) return error.message;
  return "推送服务暂时不可用，请稍后重试";
}

export function MobileTools({ publicKey, signedIn }: { publicKey: string; signedIn: boolean }) {
  const [pushOn, setPushOn] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager?.getSubscription())
      .then((value) => setPushOn(Boolean(value)))
      .catch(() => undefined);
  }, []);
  async function togglePush() {
    if (!signedIn) return setMessage("登录后可同步推送设置");
    if (!publicKey) return setMessage("管理员尚未配置推送密钥");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setMessage("当前浏览器不支持消息推送");
    }
    setBusy(true);
    setMessage("");
    try {
      const registration = await withTimeout(navigator.serviceWorker.ready, "离线服务启动超时，请刷新页面后重试");
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const response = await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
        if (!response.ok) throw new Error("无法同步关闭推送，请稍后重试");
        await existing.unsubscribe();
        setPushOn(false);
        setMessage("推送已关闭");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("通知权限未开启，请在浏览器设置中允许后重试");
        return;
      }
      const subscription = await withTimeout(
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) }),
        "连接浏览器推送服务超时，请检查网络后重试",
      );
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => false);
        throw new Error("推送订阅保存失败，请稍后重试");
      }
      setPushOn(true);
      setMessage("推送已开启");
    } catch (error) {
      setMessage(pushErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return <div className="mobile-tools"><button className="secondary" type="button" onClick={togglePush} disabled={busy}>{busy ? "正在连接..." : pushOn ? "关闭推送" : "开启推送"}</button>{message && <small role="status">{message}</small>}</div>;
}
