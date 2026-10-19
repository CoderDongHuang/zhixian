"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function AccountAvatar({ userId, email }: { userId: string; email: string | null }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    let controller: AbortController | null = null;
    async function reload() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await fetch("/api/account/avatar", { cache: "no-store", signal: current.signal });
        const blob = response.ok ? await response.blob() : null;
        if (!active || current.signal.aborted) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = blob ? URL.createObjectURL(blob) : null;
        setSource(objectUrl);
      } catch { /* Keep the initials when an image is unavailable. */ }
    }
    void reload();
    window.addEventListener("account-avatar-updated", reload);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("account-avatar-updated", reload);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId]);
  return <span className="account-avatar" aria-hidden="true">{source ? <Image src={source} alt="" width={80} height={80} unoptimized /> : email?.charAt(0).toUpperCase() || "知"}</span>;
}
