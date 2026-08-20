/**
 * Gentle mobile auto-scroll for the public quote / booking funnel.
 * Keeps section headings clear of the sticky header and skips when already visible.
 */

import { detectMobileDevice } from "./device";

/** Matches `scroll-mt-44` used under the tall mobile header + quick links. */
export const QUOTE_MOBILE_SCROLL_TOP_INSET_PX = 176;

export function isQuoteSectionComfortablyVisible(
  element: HTMLElement,
  topInsetPx: number = QUOTE_MOBILE_SCROLL_TOP_INSET_PX,
): boolean {
  const view: { innerHeight?: number } =
    typeof window !== "undefined" ? window : (globalThis as { innerHeight?: number });
  const rect = element.getBoundingClientRect();
  const viewportHeight = view.innerHeight || 0;
  if (viewportHeight <= 0) {
    return true;
  }

  const visibleTop = Math.max(rect.top, topInsetPx);
  const visibleBottom = Math.min(rect.bottom, viewportHeight - 12);
  const visibleHeight = visibleBottom - visibleTop;
  if (visibleHeight < 56) {
    return false;
  }

  // Heading sits below the sticky chrome and isn't pushed to the very bottom.
  return rect.top >= topInsetPx - 16 && rect.top <= viewportHeight * 0.55;
}

export type ScheduleQuoteScrollOptions = {
  /** Default true — desktop quote layout should not jump on every tap. */
  mobileOnly?: boolean;
  force?: boolean;
  topInsetPx?: number;
};

/**
 * Smooth-scroll a quote section into view after the next paint.
 * No-ops when the target is already comfortably visible (or on desktop when mobileOnly).
 */
export function scheduleQuoteSectionScroll(
  element: HTMLElement | null | undefined,
  options: ScheduleQuoteScrollOptions = {},
): () => void {
  if (!element || typeof window === "undefined") {
    return () => {};
  }

  const mobileOnly = options.mobileOnly !== false;
  if (mobileOnly && !detectMobileDevice()) {
    return () => {};
  }

  const topInsetPx = options.topInsetPx ?? QUOTE_MOBILE_SCROLL_TOP_INSET_PX;
  if (!options.force && isQuoteSectionComfortablyVisible(element, topInsetPx)) {
    return () => {};
  }

  let cancelled = false;
  let outerFrame = 0;
  let innerFrame = 0;

  outerFrame = window.requestAnimationFrame(() => {
    innerFrame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      if (!options.force && isQuoteSectionComfortablyVisible(element, topInsetPx)) {
        return;
      }
      element.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(outerFrame);
    window.cancelAnimationFrame(innerFrame);
  };
}

export function scheduleQuoteSectionScrollById(
  id: string,
  options: ScheduleQuoteScrollOptions = {},
): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }
  return scheduleQuoteSectionScroll(document.getElementById(id), options);
}
