"use client";

import { useEffect, useMemo, useState } from "react";
import { createWebPushController } from "@/lib/web-push-client";

function fromBase64Url(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function pushErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "通知权限被拒绝，请在浏览器设置中允许后重试";
  if (error instanceof Error && error.message) return error.message;
  return "推送服务暂时不可用，请稍后重试";
}

export function MobileTools({ publicKey, userId }: { publicKey: string; userId: string }) {
  const [pushOn, setPushOn] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const controller = useMemo(() => createWebPushController({
    ready: async () => {
      const registration = await navigator.serviceWorker.ready;
      return {
        getSubscription: () => registration.pushManager.getSubscription(),
        subscribe: () => registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) }),
      };
    },
    permission: () => Notification.requestPermission(),
    fetch: (...args) => fetch(...args),
    read: () => {
      const raw = localStorage.getItem("zhixian-push:" + userId);
      if (!raw) return null;
      try {
        const value = JSON.parse(raw);
        return typeof value.endpoint === "string" && typeof value.enabled === "boolean" && Number.isSafeInteger(value.changedAt) ? value : null;
      } catch { return null; }
    },
    write: (value) => localStorage.setItem("zhixian-push:" + userId, JSON.stringify(value)),
  }), [publicKey, userId]);
  useEffect(() => {
    let mounted = true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setBusy(false);
      return;
    }
    controller.reconcile().then((value) => { if (mounted) setPushOn(value); })
      .catch((error) => { if (mounted) setMessage(pushErrorMessage(error)); })
      .finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [controller]);
  async function togglePush() {
    if (!publicKey && !pushOn) return setMessage("管理员尚未配置推送密钥");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setMessage("当前浏览器不支持消息推送");
    setBusy(true);
    setMessage("");
    try {
      const value = await controller.toggle(!pushOn);
      setPushOn(value);
      setMessage(value ? "推送已开启" : "推送已关闭");
    } catch (error) {
      setMessage(pushErrorMessage(error));
      try { setPushOn(await controller.reconcile()); } catch { setPushOn(false); }
    } finally { setBusy(false); }
  }
  return <div className="mobile-tools"><button className="secondary" type="button" onClick={togglePush} disabled={busy}>{busy ? "正在同步..." : pushOn ? "关闭推送" : "开启推送"}</button>{message && <small role="status">{message}</small>}</div>;
}
