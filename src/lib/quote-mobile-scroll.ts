/**
 * Responsive auto-scroll for the public quote / booking funnel.
 * Scrolls only when the next section is not fully visible in the viewport.
 * Accounts for sticky header offset (mobile vs desktop).
 */

/** Matches `scroll-mt-44` under the tall mobile header + quick links. */
export const QUOTE_MOBILE_SCROLL_TOP_INSET_PX = 176;
/** Matches `md:scroll-mt-28` under the shorter desktop sticky header. */
export const QUOTE_DESKTOP_SCROLL_TOP_INSET_PX = 112;

export function getQuoteScrollTopInsetPx(): number {
  if (typeof window === "undefined") {
    return QUOTE_MOBILE_SCROLL_TOP_INSET_PX;
  }
  return window.matchMedia("(min-width: 768px)").matches
    ? QUOTE_DESKTOP_SCROLL_TOP_INSET_PX
    : QUOTE_MOBILE_SCROLL_TOP_INSET_PX;
}

function getViewportHeight(): number {
  const view: { innerHeight?: number } =
    typeof window !== "undefined" ? window : (globalThis as { innerHeight?: number });
  return view.innerHeight || 0;
}

/**
 * True when the section is already fully (or sufficiently, if taller than the viewport)
 * visible below the sticky header — so auto-scroll should no-op.
 */
export function isQuoteSectionFullyVisible(
  element: HTMLElement,
  topInsetPx: number = getQuoteScrollTopInsetPx(),
): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = getViewportHeight();
  if (viewportHeight <= 0) {
    return true;
  }

  const bottomPad = 12;
  const available = viewportHeight - topInsetPx - bottomPad;
  if (available <= 0) {
    return true;
  }

  // Already interacting inside this section — don't yank focus/scroll away.
  if (typeof document !== "undefined") {
    const active = document.activeElement;
    if (active instanceof HTMLElement && element.contains(active)) {
      return true;
    }
  }

  if (rect.height <= available + 1) {
    // Fits in the remaining viewport: require full visibility under the sticky chrome.
    return rect.top >= topInsetPx - 8 && rect.bottom <= viewportHeight - bottomPad + 8;
  }

  // Taller than the viewport: treat as "visible enough" when the heading sits under
  // the sticky header and the section fills the rest of the screen.
  return (
    rect.top >= topInsetPx - 8 &&
    rect.top <= topInsetPx + 32 &&
    rect.bottom >= viewportHeight - 40
  );
}

/** @deprecated Prefer isQuoteSectionFullyVisible — kept for existing imports/tests. */
export function isQuoteSectionComfortablyVisible(
  element: HTMLElement,
  topInsetPx?: number,
): boolean {
  return isQuoteSectionFullyVisible(element, topInsetPx ?? getQuoteScrollTopInsetPx());
}

export type ScheduleQuoteScrollOptions = {
  /**
   * @deprecated Ignored — scrolling is viewport-driven on mobile and desktop.
   * Kept so older call sites keep compiling.
   */
  mobileOnly?: boolean;
  force?: boolean;
  topInsetPx?: number;
};

/**
 * Smooth-scroll a quote section into view after the next paint when needed.
 * No-ops when the target is already fully visible (or focus is already inside it).
 */
export function scheduleQuoteSectionScroll(
  element: HTMLElement | null | undefined,
  options: ScheduleQuoteScrollOptions = {},
): () => void {
  if (!element || typeof window === "undefined") {
    return () => {};
  }

  const topInsetPx = options.topInsetPx ?? getQuoteScrollTopInsetPx();
  if (!options.force && isQuoteSectionFullyVisible(element, topInsetPx)) {
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
      if (!options.force && isQuoteSectionFullyVisible(element, topInsetPx)) {
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
