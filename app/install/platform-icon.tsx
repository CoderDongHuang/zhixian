import type { PlatformId } from "./platforms";

export function PlatformIcon({ platform }: { platform: PlatformId }) {
  return <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    {platform === "windows" ? <g fill="currentColor"><path d="M4 6.5 14 5v10H4zM17 4.5 28 3v12H17zM4 17h10v10L4 25.5zM17 17h11v12l-11-1.5z" /></g>
      : platform === "macos" ? <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="26" height="18" rx="3" /><path d="M12 28h8M16 23v5M7 19h18" /></g>
        : platform === "linux" ? <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="26" height="22" rx="4" /><path d="m9 12 4 4-4 4m8 0h6" /></g>
          : platform === "android" ? <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m10 7-2-3m14 3 2-3M6 16a10 10 0 0 1 20 0zm0 0v9h20v-9M11 25v4m10-4v4M2 17v6m28-6v6" /><circle cx="11" cy="12" r=".8" fill="currentColor" /><circle cx="21" cy="12" r=".8" fill="currentColor" /></g>
            : <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="16" height="28" rx="4" /><path d="M13 6h6m-4 20h2" /></g>}
  </svg>;
}
