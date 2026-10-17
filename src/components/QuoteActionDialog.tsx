"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cancelCompetingScrollJobs } from "@/lib/scroll-jobs";

/** Result actions stay over the current viewport, without moving the quote behind them. */
export default function QuoteActionDialog({
  title, titleId, onClose, closeDisabled = false, role = "dialog", wide = false, children,
}: {
  title: string;
  titleId?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  role?: "dialog" | "alertdialog";
  wide?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    cancelCompetingScrollJobs();
    const body = document.body;
    const x = window.scrollX, y = window.scrollY;
    const previousFocus = document.activeElement;
    const keys = ["position", "top", "left", "width", "overflow", "paddingRight"] as const;
    const previous = keys.map((key) => body.style[key]);
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = `-${x}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.paddingRight = `${padding + scrollbar}px`;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const targets = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? []).filter((element) => element.getClientRects().length > 0);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      keys.forEach((key, index) => { body.style[key] = previous[index]; });
      window.scrollTo({ left: x, top: y, behavior: "instant" });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/80 p-4 sm:items-center"
      role={role} aria-modal="true" aria-labelledby={headingId} data-quote-action-dialog>
      <div ref={panelRef} className={`quote-flow max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-white/24 bg-navy-dark shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-white/20 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">My Airport Taxi NI</p>
            <h2 id={headingId} className="mt-1 text-lg font-semibold text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm quote-secondary hover:bg-white/10 hover:text-white disabled:opacity-50">✕</button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>, document.body,
  );
}
