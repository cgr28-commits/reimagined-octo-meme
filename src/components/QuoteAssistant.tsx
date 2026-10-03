"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { useIsMobileDevice } from "@/lib/device";
import { shouldHidePublicSalesWidgets } from "@/lib/owner-portal";

/**
 * Desktop Help launcher only.
 * The chat panel is loaded with import() on the first tap, and is not prefetched.
 */

const HELP_BTN_PX = 50;
const HELP_EDGE_PX = 22;
const HELP_QUOTE_PAD_PX = 12;

type HelpCorner = "bottom-right" | "bottom-left";

type QuoteAssistantPanelProps = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  launcherRef: RefObject<HTMLButtonElement | null>;
};

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect,
  pad: number,
): boolean {
  return !(
    a.right < b.left - pad ||
    a.left > b.right + pad ||
    a.bottom < b.top - pad ||
    a.top > b.bottom + pad
  );
}

function chooseHelpCorner(quote: DOMRect | null, vw: number, vh: number): HelpCorner {
  const edge = HELP_EDGE_PX;
  const size = HELP_BTN_PX;
  const br = {
    left: vw - edge - size,
    top: vh - edge - size,
    right: vw - edge,
    bottom: vh - edge,
  };
  if (!quote || !rectsOverlap(br, quote, HELP_QUOTE_PAD_PX)) return "bottom-right";
  const bl = {
    left: edge,
    top: vh - edge - size,
    right: edge + size,
    bottom: vh - edge,
  };
  if (!rectsOverlap(bl, quote, HELP_QUOTE_PAD_PX)) return "bottom-left";
  // Prefer bottom-right visibility; Live Quote must not be moved for clearance.
  return "bottom-right";
}

export default function QuoteAssistant() {
  const isMobile = useIsMobileDevice();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<QuoteAssistantPanelProps> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [helpCorner, setHelpCorner] = useState<HelpCorner>("bottom-right");
  const launcherRef = useRef<HTMLButtonElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** Keep the “?” fixed to the viewport; prefer BR, fall back to BL if it covers #quote. */
  useLayoutEffect(() => {
    if (!mounted || isMobile !== false) return;

    function syncCorner() {
      if (open) {
        setHelpCorner("bottom-right");
        return;
      }
      const quote = document.getElementById("quote")?.getBoundingClientRect() ?? null;
      setHelpCorner(chooseHelpCorner(quote, window.innerWidth, window.innerHeight));
    }

    syncCorner();
    window.addEventListener("resize", syncCorner);
    window.addEventListener("scroll", syncCorner, { passive: true });
    const quoteEl = document.getElementById("quote");
    const ro =
      quoteEl && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncCorner())
        : null;
    if (quoteEl && ro) ro.observe(quoteEl);
    return () => {
      window.removeEventListener("resize", syncCorner);
      window.removeEventListener("scroll", syncCorner);
      ro?.disconnect();
    };
  }, [mounted, open, isMobile, pathname]);

  function onLauncherClick() {
    if (open) {
      setOpen(false);
      return;
    }
    if (Panel) {
      setOpen(true);
      return;
    }
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    // Loaded only after this click. The chunk is not hinted for prefetch.
    void import(/* webpackChunkName: "quote-assistant-panel" */ "./QuoteAssistantPanel")
      .then((mod) => {
        setPanel(() => mod.default);
        setOpen(true);
      })
      .catch(() => {
        loadingRef.current = false;
      })
      .finally(() => {
        setLoading(false);
      });
  }

  const helpEdgeY = `max(${HELP_EDGE_PX}px, env(safe-area-inset-bottom, 0px))`;
  const helpEdgeRight = `max(${HELP_EDGE_PX}px, env(safe-area-inset-right, 0px))`;
  const helpEdgeLeft = `max(${HELP_EDGE_PX}px, env(safe-area-inset-left, 0px))`;
  const launcherStyle: CSSProperties =
    helpCorner === "bottom-left"
      ? {
          position: "fixed",
          zIndex: 60,
          bottom: helpEdgeY,
          left: helpEdgeLeft,
          right: "auto",
          top: "auto",
        }
      : {
          position: "fixed",
          zIndex: 60,
          bottom: helpEdgeY,
          right: helpEdgeRight,
          left: "auto",
          top: "auto",
        };

  if (!mounted) return null;
  // Desktop/tablet only (≥768px). Mobile uses the Header WhatsApp control instead.
  // Require isMobile === false so neither control flashes before the breakpoint resolves.
  if (isMobile !== false) return null;
  // Owner/admin/driver dashboards — keep the public quote assistant off private ops screens.
  if (shouldHidePublicSalesWidgets(pathname)) return null;

  const ui = (
    <>
      {/* Desktop-only round “?” — never a Help pill; mobile uses WhatsApp FAB instead. */}
      <button
        ref={launcherRef}
        type="button"
        data-matni-help-launcher="true"
        data-matni-help-corner={helpCorner}
        onClick={onLauncherClick}
        style={launcherStyle}
        className="matni-help-launcher flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-emerald bg-navy text-white shadow-lg shadow-black/35 transition-colors hover:bg-navy-light"
        aria-label={open ? "Close help" : "Help"}
        aria-expanded={open}
        aria-busy={loading}
      >
        {open ? (
          <svg className="h-5 w-5 text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : loading ? (
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white [animation-delay:240ms]" />
          </span>
        ) : (
          <span className="select-none text-[1.75rem] font-light leading-none text-white" aria-hidden>
            ?
          </span>
        )}
      </button>
      {Panel ? <Panel open={open} setOpen={setOpen} launcherRef={launcherRef} /> : null}
    </>
  );

  return createPortal(ui, document.body);
}
