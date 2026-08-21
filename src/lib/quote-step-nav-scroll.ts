/**
 * Mobile-only scroll after explicit Live Quote step navigation
 * (Book Now / Continue / Back). Not used for passenger/luggage selections.
 */

import { detectMobileDevice } from "@/lib/device";

export type QuoteStepNavTarget = 1 | 2 | 3;

/**
 * Scroll an active quote-step section into view on mobile once.
 * Relies on the element's CSS `scroll-mt-*` for sticky header offset.
 * Desktop is a no-op. Cancel the returned cleanup if the step changes again
 * before the frame fires (keeps one scroll per user action).
 */
export function scheduleMobileQuoteStepNavScroll(
  element: HTMLElement | null,
): () => void {
  if (typeof window === "undefined" || !element) {
    return () => {};
  }
  if (!detectMobileDevice()) {
    return () => {};
  }

  let cancelled = false;
  let raf2 = 0;
  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled || !element.isConnected) {
        return;
      }
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) {
      window.cancelAnimationFrame(raf2);
    }
  };
}
