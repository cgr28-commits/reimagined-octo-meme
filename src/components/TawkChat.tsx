"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { shouldHidePublicSalesWidgets } from "@/lib/owner-portal";
import { withBasePath } from "@/lib/paths";
import { whatsAppChatUrl } from "@/lib/contact-card";
import QuoteNavLink from "@/components/QuoteNavLink";

type TawkAPI = {
  onLoad?: () => void;
  onChatMaximized?: () => void;
  onChatMinimized?: () => void;
  showWidget?: () => void;
  hideWidget?: () => void;
  maximize?: () => void;
};
type ChatWindow = Window & {
  Tawk_API?: TawkAPI;
  Tawk_LoadStart?: Date;
  __matniTawkReady?: boolean;
};

export default function TawkChat() {
  const pathname = usePathname();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    const chatWindow = window as ChatWindow;
    const hidden = shouldHidePublicSalesWidgets(pathname);
    const api = (chatWindow.Tawk_API ??= {});
    const openReadyChat = () => {
      if (hidden || !requested.current || !chatWindow.__matniTawkReady) return;
      try {
        chatWindow.Tawk_API?.showWidget?.();
        chatWindow.Tawk_API?.maximize?.();
      } catch {
        requested.current = false;
        setOpening(false);
        setFailed(true);
      }
    };
    const onLoad = () => {
      chatWindow.__matniTawkReady = true;
      if (requested.current && !hidden) openReadyChat();
      else chatWindow.Tawk_API?.hideWidget?.();
    };
    const onMaximized = () => {
      if (hidden) {
        chatWindow.Tawk_API?.hideWidget?.();
        return;
      }
      requested.current = false;
      setOpening(false);
      setFailed(false);
    };
    const onMinimized = () => {
      requested.current = false;
      setOpening(false);
      chatWindow.Tawk_API?.hideWidget?.();
    };
    api.onLoad = onLoad;
    api.onChatMaximized = onMaximized;
    api.onChatMinimized = onMinimized;
    api.hideWidget?.();
    if (hidden) {
      requested.current = false;
      setOpening(false);
      setFailed(false);
    }

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
    return () => {
      if (api.onLoad === onLoad) api.onLoad = undefined;
      if (api.onChatMaximized === onMaximized) api.onChatMaximized = undefined;
      if (api.onChatMinimized === onMinimized) api.onChatMinimized = undefined;
    };
  }, [pathname]);

  useEffect(() => {
    if (!opening || shouldHidePublicSalesWidgets(pathname)) return;
    // Method availability alone does not mean the widget finished loading.
    // Only onLoad marks readiness; onChatMaximized confirms it actually opened.
    const chatWindow = window as ChatWindow;
    if (chatWindow.__matniTawkReady) {
      try {
        chatWindow.Tawk_API?.showWidget?.();
        chatWindow.Tawk_API?.maximize?.();
      } catch {
        requested.current = false;
        setOpening(false);
        setFailed(true);
        return;
      }
    }
    const timer = setTimeout(() => {
      if (!requested.current) return;
      requested.current = false;
      setOpening(false);
      setFailed(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, [opening, pathname]);

  function openChat() {
    requested.current = true;
    setFailed(false);
    setOpening(true);
  }

  if (shouldHidePublicSalesWidgets(pathname)) return null;

  const bottom = "calc(16px + env(safe-area-inset-bottom, 0px) + var(--matni-cookie-banner-offset, 0px))";
  return (
    <>
      <button
        type="button"
        disabled={opening}
        aria-busy={opening}
        onClick={openChat}
        aria-label="Chat with My Airport Taxi NI"
        className="fixed left-4 z-[65] inline-flex min-h-14 items-center gap-2 rounded-full border border-white/40 bg-navy py-1 pl-1 pr-4 text-sm font-semibold text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald"
        style={{ bottom }}
      >
        <Image src={withBasePath("/google-business-logo-navy.png")} alt="" width={48} height={48} className="h-12 w-12 rounded-full" />
        <span>{opening ? "Opening chat…" : "Chat"}</span>
      </button>
      {failed ? (
        <div role="status" className="fixed left-4 z-[66] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-lg sm:max-w-sm"
          style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px) + var(--matni-cookie-banner-offset, 0px))" }}>
          <p>Live chat is temporarily unavailable. Get your fixed price using our quote tool, or message us on WhatsApp.</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <QuoteNavLink onNavigate={() => setFailed(false)} className="font-semibold underline">Get my fixed price</QuoteNavLink>
            <a href={whatsAppChatUrl()} target="_blank" rel="noopener noreferrer" className="font-semibold underline">WhatsApp us</a>
            <button type="button" onClick={openChat} className="underline">Retry chat</button>
            <button type="button" onClick={() => setFailed(false)} className="underline">Close</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
