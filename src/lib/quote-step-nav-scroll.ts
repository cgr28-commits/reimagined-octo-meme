/**
 * Shared booking-form navigation: scroll + focus after step/CTA changes.
 * Measures the live fixed header — does not rely on URL hash alone.
 *
 * Quote stages use stable ids:
 * - #journey-type-selector
 * - #passenger-luggage-section
 * - #quote-route-summary
 */

import {
  cancelCompetingScrollJobs,
  getScrollJobGeneration,
  isScrollJobGenerationCurrent,
  trackScrollJob,
} from "@/lib/scroll-jobs";

export type BookingNavTargetId =
  | "quote"
  | "step1-journey-details"
  | "step2-travel-details"
  | "step3-customer-details"
  | "journey-type-selector"
  | "passenger-luggage-section"
  | "quote-route-summary"
  | "quote-results-summary"
  | "quote-price-summary"
  | "quote-step1-next"
  | "quote-step2-next"
  | "quote-availability-confirmation";

export type QuoteStepNavTarget = 1 | 2 | 3;

/** Keep section tops ~12–16px below the fixed header. */
export const HEADER_CLEARANCE_PX = 16;
const LONG_JUMP_PX = 900;
const RESULTS_CORRECTION_MS = 150;
const RESULTS_CORRECTION_TOLERANCE_PX = 4;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Live fixed-header element (main site chrome). */
export function getFixedHeaderElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const header = document.querySelector("header.fixed, header[class*='fixed']");
  return header instanceof HTMLElement ? header : null;
}

/** Bottom edge of the fixed header in viewport coordinates. */
export function getHeaderBottomPx(): number {
  const header = getFixedHeaderElement();
  if (header) {
    return Math.round(header.getBoundingClientRect().bottom);
  }
  // No site chrome (e.g. manage-booking) — do not invent a phantom offset.
  return 0;
}

/** Legacy offset helper — header height + clearance. */
export function getFixedHeaderOffsetPx(): number {
  if (typeof document === "undefined") return 144;
  const header = getFixedHeaderElement();
  if (!header) return HEADER_CLEARANCE_PX;
  const height = header.getBoundingClientRect().height;
  return Math.max(HEADER_CLEARANCE_PX, Math.round(height + HEADER_CLEARANCE_PX));
}

export function resolveBookingNavElement(
  target: BookingNavTargetId | HTMLElement | string | null | undefined,
): HTMLElement | null {
  if (typeof document === "undefined" || target == null) return null;
  if (typeof target !== "string") return target;
  return document.getElementById(target);
}

function scrollBehaviorForDistance(distancePx: number): ScrollBehavior {
  if (prefersReducedMotion()) return "auto";
  if (distancePx >= LONG_JUMP_PX) return "auto";
  return "smooth";
}

/**
 * Precise Y so the target top sits `clearancePx` below the header bottom.
 * Formula: scrollY + target.getBoundingClientRect().top - (headerBottom + clearance)
 */
export function computeScrollTopBelowHeader(
  element: HTMLElement,
  clearancePx: number = HEADER_CLEARANCE_PX,
): number {
  const headerBottom = getHeaderBottomPx();
  const top = element.getBoundingClientRect().top;
  return Math.max(0, Math.round(window.scrollY + top - (headerBottom + clearancePx)));
}

function focusHeadingIn(element: HTMLElement): void {
  const heading =
    element.matches("h1,h2,h3,h4,[data-booking-nav-heading],[data-site-nav-heading]")
      ? element
      : element.querySelector<HTMLElement>(
          "h1,h2,h3,[data-booking-nav-heading],[data-site-nav-heading]",
        );
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) {
    heading.tabIndex = -1;
  }
  try {
    heading.focus({ preventScroll: true });
  } catch {
    heading.focus();
  }
}

/**
 * Scroll a booking target into view using the measured header bottom + clearance.
 */
export function scrollBookingTargetIntoView(
  target: BookingNavTargetId | HTMLElement | string | null | undefined,
  options?: {
    focusHeading?: boolean;
    behavior?: ScrollBehavior;
    clearancePx?: number;
  },
): void {
  const element = resolveBookingNavElement(target);
  if (!element || typeof window === "undefined") return;

  const clearancePx = options?.clearancePx ?? HEADER_CLEARANCE_PX;
  const nextTop = computeScrollTopBelowHeader(element, clearancePx);
  const distance = Math.abs(window.scrollY - nextTop);
  const behavior = options?.behavior ?? scrollBehaviorForDistance(distance);

  window.scrollTo({ top: nextTop, behavior });

  if (options?.focusHeading) {
    focusHeadingIn(element);
  }
}

/**
 * After React commits, scroll (and optionally focus) the target.
 * Cancel the returned cleanup if another navigation supersedes this one.
 */
export function scheduleBookingNavAfterRender(
  target: BookingNavTargetId | HTMLElement | string | null | undefined,
  options?: {
    focusHeading?: boolean;
    behavior?: ScrollBehavior;
    clearancePx?: number;
  },
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const generation = getScrollJobGeneration();
  let cancelled = false;
  let raf2 = 0;
  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
      scrollBookingTargetIntoView(target, options);
    });
  });

  const cancel = () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
  };
  return trackScrollJob(cancel);
}

/**
 * Mobile Express free-area acknowledgement → bring Book Now into comfortable view.
 *
 * Do not rely on scrollIntoView() of the sticky `#quote-step1-next` wrapper —
 * iOS often treats sticky CTAs as already “visible” and does not move the page.
 * Scroll the document using the Book Now button’s layout position instead.
 */
export function scheduleScrollToBookNowAfterExpressAck(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const generation = getScrollJobGeneration();
  let cancelled = false;
  let raf2 = 0;
  let retryTimer = 0;
  let secondRetryTimer = 0;

  const resolveBookNowButton = (): HTMLElement | null => {
    const byId = document.getElementById("quote-book-now-button");
    if (byId instanceof HTMLElement && byId.getClientRects().length > 0) {
      return byId;
    }
    const buttons = document.querySelectorAll<HTMLElement>(
      "#quote-step1-next button[type='submit'], button#quote-book-now-button",
    );
    for (const button of buttons) {
      if (button.getClientRects().length > 0) return button;
    }
    return null;
  };

  const scrollBookNowIntoComfortableView = (behavior: ScrollBehavior) => {
    const element = resolveBookNowButton();
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const headerBottom = getHeaderBottomPx();
    const usableHeight = Math.max(220, window.innerHeight - headerBottom);
    // Lower-middle of the area below the sticky header (not flush to the bottom).
    const targetViewportY = headerBottom + usableHeight * 0.58;
    const nextTop = Math.max(0, Math.round(window.scrollY + rect.top - targetViewportY));

    window.scrollTo({ top: nextTop, behavior });
    return true;
  };

  const run = (behavior: ScrollBehavior) => {
    if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
    scrollBookNowIntoComfortableView(behavior);
  };

  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";

  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      run(behavior);
      // iOS often cancels scrolls started in the same turn as a checkbox change —
      // retry after layout settles, then once more with instant scroll if still off-screen.
      retryTimer = window.setTimeout(() => {
        if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
        run(behavior);
        secondRetryTimer = window.setTimeout(() => {
          if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
          const element = resolveBookNowButton();
          if (!element) return;
          const rect = element.getBoundingClientRect();
          const headerBottom = getHeaderBottomPx();
          const stillHidden =
            rect.top > window.innerHeight - 80 || rect.bottom < headerBottom + 40;
          if (stillHidden) {
            run("auto");
          }
        }, 280);
      }, 100);
    });
  });

  const cancel = () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
    if (retryTimer) window.clearTimeout(retryTimer);
    if (secondRetryTimer) window.clearTimeout(secondRetryTimer);
  };
  return trackScrollJob(cancel);
}

/**
 * Final mobile/desktop results scroll to #quote-route-summary.
 * - Waits two animation frames for layout settle
 * - Uses behavior: "auto" to avoid Safari overshoot
 * - One corrective scroll ~150ms later if displaced by >4px
 * - Does not focus the price card or Book Now
 */
export function schedulePreciseResultsScroll(
  target: BookingNavTargetId | string = "quote-route-summary",
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const generation = getScrollJobGeneration();
  let cancelled = false;
  let raf2 = 0;
  let correctionTimer = 0;

  const applyScroll = () => {
    const element = resolveBookingNavElement(target);
    if (!element || cancelled || !isScrollJobGenerationCurrent(generation)) return;
    const nextTop = computeScrollTopBelowHeader(element, HEADER_CLEARANCE_PX);
    window.scrollTo({ top: nextTop, behavior: "auto" });
  };

  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
      applyScroll();
      correctionTimer = window.setTimeout(() => {
        if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
        const element = resolveBookingNavElement(target);
        if (!element) return;
        const desired = computeScrollTopBelowHeader(element, HEADER_CLEARANCE_PX);
        if (Math.abs(window.scrollY - desired) > RESULTS_CORRECTION_TOLERANCE_PX) {
          window.scrollTo({ top: desired, behavior: "auto" });
        }
      }, RESULTS_CORRECTION_MS);
    });
  });

  const cancel = () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
    if (correctionTimer) window.clearTimeout(correctionTimer);
  };
  return trackScrollJob(cancel);
}

/** Map quote step number → stable section id. */
export function quoteStepTargetId(step: QuoteStepNavTarget): BookingNavTargetId {
  if (step === 2) return "step2-travel-details";
  if (step === 3) return "step3-customer-details";
  return "step1-journey-details";
}

/**
 * @deprecated Prefer scheduleBookingNavAfterRender — kept for existing imports/tests.
 */
export function scheduleMobileQuoteStepNavScroll(
  element: HTMLElement | null,
): () => void {
  return scheduleBookingNavAfterRender(element, { focusHeading: true });
}

/** Focus + scroll the first invalid control (validation failures). */
export function focusFirstInvalidField(
  root: ParentNode | null | undefined,
): HTMLElement | null {
  if (!root || typeof window === "undefined") return null;
  const candidate =
    root.querySelector<HTMLElement>(
      '[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid',
    ) ??
    root.querySelector<HTMLElement>(".text-red-400, .text-red-300, [data-field-error]");

  let field = candidate;
  if (field && !field.matches("input,select,textarea,button,[tabindex]")) {
    const described = field.id
      ? root.querySelector<HTMLElement>(`[aria-describedby~="${field.id}"]`)
      : null;
    field = described ?? field;
  }
  if (!field) return null;

  scrollBookingTargetIntoView(field, { behavior: prefersReducedMotion() ? "auto" : "smooth" });
  try {
    field.focus({ preventScroll: true });
  } catch {
    field.focus();
  }
  return field;
}

/** Re-export for menu navigation callers that need to clear quote timers. */
export { cancelCompetingScrollJobs };
