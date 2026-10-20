"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { shouldHidePublicSalesWidgets } from "@/lib/owner-portal";
import { withBasePath } from "@/lib/paths";

type TawkAPI = {
  onLoad?: () => void;
  showWidget?: () => void;
  hideWidget?: () => void;
  maximize?: () => void;
  onChatMinimized?: () => void;
};

type ChatWindow = Window & { Tawk_API?: TawkAPI; Tawk_LoadStart?: Date };
const DIRECT_CHAT_URL = "https://tawk.to/chat/6ad66513bb99a434ca8e2310/1k5anllun?layout=modern";

export default function TawkChat() {
  const pathname = usePathname();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const chatWindow = window as ChatWindow;
    const hidden = shouldHidePublicSalesWidgets(pathname);
    const api = (chatWindow.Tawk_API ??= {});
    const syncVisibility = () => {
      // The site's own launcher stays visible even if the remote widget fails.
      // Keep Tawk's default bubble hidden to avoid two chat buttons.
      chatWindow.Tawk_API?.hideWidget?.();
    };
    api.onLoad = syncVisibility;
    api.onChatMinimized = syncVisibility;
    syncVisibility();

    // Load once, and only after visiting a public customer page.
    if (!hidden && !document.getElementById("matni-tawk-chat")) {
      chatWindow.Tawk_LoadStart = new Date();
      const script = document.createElement("script");
      script.id = "matni-tawk-chat";
      script.async = true;
      script.src = "https://embed.tawk.to/6ad66513bb99a434ca8e2310/1k5anllun";
      script.charset = "UTF-8";
      script.setAttribute("crossorigin", "*");
      document.head.appendChild(script);
    }
  }, [pathname]);

  useEffect(() => {
    if (!opening || shouldHidePublicSalesWidgets(pathname)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 12000;
    const tryOpen = () => {
      if (cancelled) return;
      const api = (window as ChatWindow).Tawk_API;
      if (typeof api?.maximize === "function") {
        try {
          api.showWidget?.();
          api.maximize();
          setOpening(false);
          return;
        } catch {
          // Retry while the widget finishes initialising.
        }
      }
      if (Date.now() >= deadline) {
        setOpening(false);
        setFailed(true);
        return;
      }
      timer = setTimeout(tryOpen, 200);
    };
    tryOpen();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [opening, pathname]);

  function openChat() {
    setFailed(false);
    setOpening(true);
  }

  if (shouldHidePublicSalesWidgets(pathname)) return null;

  return (
    <>
    <button
      type="button"
      disabled={opening}
      aria-busy={opening}
      onClick={openChat}
      aria-label="Chat with My Airport Taxi NI"
      className="fixed left-4 z-[65] inline-flex min-h-14 items-center gap-2 rounded-full border border-white/40 bg-navy py-1 pl-1 pr-4 text-sm font-semibold text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px) + var(--matni-cookie-banner-offset, 0px))" }}
    >
      <Image
        src={withBasePath("/google-business-logo-navy.png")}
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 rounded-full"
      />
      <span>{opening ? "Opening chat…" : "Chat"}</span>
    </button>
    {failed && (
      <div role="status" className="fixed bottom-24 left-4 z-[66] max-w-xs rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-lg">
        <p>Chat could not load. Please try again, or open our separate chat page.</p>
        <a href={DIRECT_CHAT_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold underline">Open separate chat page</a>
        <button type="button" onClick={() => setFailed(false)} className="ml-4 underline">Close</button>
      </div>
    )}
    </>
  );
}
