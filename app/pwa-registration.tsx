"use client";

import { useEffect, useState } from "react";

export function PwaRegistration() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    return () => { window.removeEventListener("beforeinstallprompt", onInstall); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  async function install() { if (!installPrompt) return; await installPrompt.prompt(); setInstallPrompt(null); }
  async function clearCache() { const registrations = await navigator.serviceWorker?.getRegistrations(); await Promise.all((registrations || []).map((registration) => registration.unregister())); const keys = await caches.keys(); await Promise.all(keys.map((key) => caches.delete(key))); window.location.reload(); }
  if (installed) return <button className="pwa-tools" type="button" onClick={clearCache} title="清理离线缓存">清理缓存</button>;
  if (!installPrompt) return null;
  return <button className="pwa-tools" type="button" onClick={install}>安装知线</button>;
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
