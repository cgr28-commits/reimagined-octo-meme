"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { whatsAppChatUrl } from "@/lib/contact-card";
import { useIsMobileDevice } from "@/lib/device";
import { shouldHidePublicSalesWidgets } from "@/lib/owner-portal";

const HELP_WHATSAPP_MESSAGE =
  "Hi, I need some help with an airport transfer.";
const EDGE_PX = 22;
const BTN_PX = 50;
const QUOTE_PAD = 12;

/**
 * Mobile-only floating WhatsApp control.
 * Desktop uses the round “?” help button in QuoteAssistant — never both at once.
 * Portaled to document.body so it stays position:fixed to the viewport.
 */
export default function WhatsAppButton() {
  const isMobile = useIsMobileDevice();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [bottomPx, setBottomPx] = useState(EDGE_PX);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted || isMobile !== true) return;

    function syncBottom() {
      const quote = document.getElementById("quote");
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let bottom = EDGE_PX;
      if (!quote) {
        setBottomPx(bottom);
        return;
      }

      // Nudge upward until the FAB clears the Live Quote card (never move the quote).
      for (let i = 0; i < 40; i += 1) {
        const box = {
          left: vw - EDGE_PX - BTN_PX,
          top: vh - bottom - BTN_PX,
          right: vw - EDGE_PX,
          bottom: vh - bottom,
        };
        const q = quote.getBoundingClientRect();
        const overlaps = !(
          box.right < q.left - QUOTE_PAD ||
          box.left > q.right + QUOTE_PAD ||
          box.bottom < q.top - QUOTE_PAD ||
          box.top > q.bottom + QUOTE_PAD
        );
        if (!overlaps) break;
        bottom += 8;
        if (bottom > vh * 0.45) break;
      }
      setBottomPx(bottom);
    }

    syncBottom();
    window.addEventListener("resize", syncBottom);
    window.addEventListener("scroll", syncBottom, { passive: true });
    const quote = document.getElementById("quote");
    const ro =
      quote && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncBottom())
        : null;
    if (quote && ro) ro.observe(quote);
    return () => {
      window.removeEventListener("resize", syncBottom);
      window.removeEventListener("scroll", syncBottom);
      ro?.disconnect();
    };
  }, [mounted, isMobile, pathname]);

  if (!mounted) return null;
  // Wait for breakpoint — avoids flashing WhatsApp on desktop before media query resolves.
  if (isMobile !== true) return null;
  if (shouldHidePublicSalesWidgets(pathname)) return null;

  const href = whatsAppChatUrl(HELP_WHATSAPP_MESSAGE);

  return createPortal(
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-matni-whatsapp-fab="true"
      aria-label="WhatsApp us for help with an airport transfer"
      className="matni-whatsapp-fab fixed z-[60] flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/30 transition-transform hover:scale-[1.03] active:scale-95"
      style={{
        bottom: `max(${bottomPx}px, env(safe-area-inset-bottom, 0px))`,
        right: `max(${EDGE_PX}px, env(safe-area-inset-right, 0px))`,
      }}
    >
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>,
    document.body,
  );
}
