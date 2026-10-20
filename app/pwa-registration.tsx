"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Installation = {
  available: boolean;
  installed: boolean;
  busy: boolean;
  message: string;
  install: () => Promise<void>;
};

const InstallContext = createContext<Installation | null>(null);

export function useInstallation() {
  const context = useContext(InstallContext);
  if (!context) throw new Error("Installation requires PwaRegistration");
  return context;
}

export function PwaRegistration({ children }: { children: ReactNode }) {
  const prompt = useRef<BeforeInstallPromptEvent | null>(null);
  const installing = useRef(false);
  const installationComplete = useRef(false);
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const isStandalone = () => display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const onDisplay = () => {
      installationComplete.current = isStandalone();
      setInstalled(installationComplete.current);
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      prompt.current = event as BeforeInstallPromptEvent;
      setAvailable(true);
    };
    const onInstalled = () => {
      installationComplete.current = true;
      setInstalled(true);
      prompt.current = null;
      setAvailable(false);
      setMessage("知线已安装，可以从设备的应用入口打开。");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    display.addEventListener("change", onDisplay);
    onDisplay();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      display.removeEventListener("change", onDisplay);
    };
  }, []);

  async function install() {
    const event = prompt.current;
    if (installing.current || installed) return;
    if (!event) {
      setMessage("请按下方指南，通过浏览器菜单安装知线。");
      return;
    }
    // A deferred prompt is single-use, including cancellation and rejection.
    installing.current = true;
    prompt.current = null;
    setAvailable(false);
    setBusy(true);
    setMessage("");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (!installationComplete.current) {
        setMessage(choice.outcome === "dismissed"
          ? "已取消安装，可稍后从浏览器菜单重试。"
          : "已提交安装请求，请完成系统提示；安装完成后可从设备的应用入口打开。");
      }
    } catch {
      setMessage("未能打开安装窗口，请按下方指南从浏览器菜单安装，或继续使用网页版。");
    } finally {
      installing.current = false;
      setBusy(false);
    }
  }

  return <InstallContext.Provider value={{ available, installed, busy, message, install }}>{children}</InstallContext.Provider>;
}
