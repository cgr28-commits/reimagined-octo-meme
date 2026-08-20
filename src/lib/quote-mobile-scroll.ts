/**
 * Responsive auto-scroll for the public quote / booking funnel.
 * Scrolls only when the next section is not fully visible in the viewport.
 * Accounts for sticky header offset (mobile vs desktop).
 *
 * At most one scheduled scroll is active at a time — a new schedule cancels the prior one
 * so React re-renders / competing effects cannot fire multiple jumps.
 */

/** Stable target for the calculated fare / journey result panel (not Book/Save). */
export const QUOTE_FARE_RESULT_ID = "quote-fare-result";

/** Matches `scroll-mt-36` under the mobile header + quick links. */
export const QUOTE_MOBILE_SCROLL_TOP_INSET_PX = 144;
/** Matches `md:scroll-mt-28` under the shorter desktop sticky header. */
export const QUOTE_DESKTOP_SCROLL_TOP_INSET_PX = 112;

let activeScrollCancel: (() => void) | null = null;

export function clearScheduledQuoteSectionScroll(): void {
  if (activeScrollCancel) {
    activeScrollCancel();
    activeScrollCancel = null;
  }
}

function replaceActiveScroll(cancel: () => void): () => void {
  clearScheduledQuoteSectionScroll();
  let settled = false;
  const wrapper = () => {
    if (settled) {
      return;
    }
    settled = true;
    cancel();
    if (activeScrollCancel === wrapper) {
      activeScrollCancel = null;
    }
  };
  activeScrollCancel = wrapper;
  return wrapper;
}

export function getQuoteScrollTopInsetPx(): number {
  if (typeof window === "undefined") {
    return QUOTE_MOBILE_SCROLL_TOP_INSET_PX;
  }
  return window.matchMedia("(min-width: 768px)").matches
    ? QUOTE_DESKTOP_SCROLL_TOP_INSET_PX
    : QUOTE_MOBILE_SCROLL_TOP_INSET_PX;
}

export function prefersQuoteReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getQuoteScrollBehavior(): ScrollBehavior {
  return prefersQuoteReducedMotion() ? "auto" : "smooth";
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

function scrollElementIntoView(element: HTMLElement): void {
  element.scrollIntoView({
    behavior: getQuoteScrollBehavior(),
    block: "start",
    inline: "nearest",
  });
}

/**
 * Smooth-scroll a quote section into view after the next paint when needed.
 * No-ops when the target is already fully visible (or focus is already inside it).
 * Cancels any previously scheduled quote scroll.
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

  const localCancel = () => {
    cancelled = true;
    window.cancelAnimationFrame(outerFrame);
    window.cancelAnimationFrame(innerFrame);
  };

  const cancel = replaceActiveScroll(localCancel);

  outerFrame = window.requestAnimationFrame(() => {
    innerFrame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      if (!options.force && isQuoteSectionFullyVisible(element, topInsetPx)) {
        cancel();
        return;
      }
      scrollElementIntoView(element);
      cancel();
    });
  });

  return cancel;
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

export type ScheduleQuoteFareResultScrollOptions = ScheduleQuoteScrollOptions & {
  /** Return true when the calculated fare / result content has rendered. */
  isReady?: () => boolean;
  /** Max rAF attempts while waiting for the result to render (default ~45 ≈ 0.75s). */
  maxAttempts?: number;
};

/**
 * Wait until `#quote-fare-result` exists and is ready, then scroll once to its top.
 * Used after luggage selection so we do not jump before the price renders, and never
 * target Book / Continue / Save.
 */
export function scheduleQuoteFareResultScroll(
  options: ScheduleQuoteFareResultScrollOptions = {},
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const maxAttempts = options.maxAttempts ?? 45;
  const isReady =
    options.isReady ??
    (() => {
      const el = document.getElementById(QUOTE_FARE_RESULT_ID);
      return Boolean(el && el.getAttribute("data-quote-ready") === "true");
    });

  let cancelled = false;
  let attempts = 0;
  let frame = 0;

  const localCancel = () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
  };

  const cancel = replaceActiveScroll(localCancel);

  const tick = () => {
    if (cancelled) {
      return;
    }
    attempts += 1;
    const el = document.getElementById(QUOTE_FARE_RESULT_ID);
    if (el && isReady()) {
      // Hand off to the standard scheduler (also replaces active cancel).
      scheduleQuoteSectionScroll(el, options);
      return;
    }
    if (attempts >= maxAttempts) {
      cancel();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  frame = window.requestAnimationFrame(tick);
  return cancel;
}
