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
  | "quote-availability-confirmation"
  | "bookingRequestResult"
  | "step2-journey-summary"
  | "step2-flight-details"
  | "quote-section-addresses"
  | "quote-book-now-anchor";

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
 *
 * Pass `correctAfterMs` after large DOM swaps (step change / success card) so
 * iOS layout settle / document-height collapse cannot leave the user mid-page.
 */
export function scheduleBookingNavAfterRender(
  target: BookingNavTargetId | HTMLElement | string | null | undefined,
  options?: {
    focusHeading?: boolean;
    behavior?: ScrollBehavior;
    clearancePx?: number;
    /** Re-measure and correct if layout shifted after the first scroll. */
    correctAfterMs?: number;
  },
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const generation = getScrollJobGeneration();
  let cancelled = false;
  let raf2 = 0;
  let correctionTimer = 0;
  const clearancePx = options?.clearancePx ?? HEADER_CLEARANCE_PX;

  const apply = (behavior?: ScrollBehavior) => {
    scrollBookingTargetIntoView(target, {
      focusHeading: options?.focusHeading,
      behavior,
      clearancePx,
    });
  };

  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
      apply(options?.behavior);

      const correctAfterMs = options?.correctAfterMs;
      if (correctAfterMs == null || correctAfterMs <= 0) return;

      correctionTimer = window.setTimeout(() => {
        if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
        const element = resolveBookingNavElement(target);
        if (!element) return;
        const desired = computeScrollTopBelowHeader(element, clearancePx);
        if (Math.abs(window.scrollY - desired) > RESULTS_CORRECTION_TOLERANCE_PX) {
          window.scrollTo({ top: desired, behavior: "auto" });
        }
      }, correctAfterMs);
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

/**
 * Guided quote-flow scroll: cancel any in-flight scroll job, then scroll once.
 * Use for every deliberate A2A/booking stage transition so effects cannot fight.
 */
export function scrollQuoteStage(
  target: BookingNavTargetId | HTMLElement | string | null | undefined,
  options?: {
    focusHeading?: boolean;
    behavior?: ScrollBehavior;
    clearancePx?: number;
    correctAfterMs?: number;
  },
): () => void {
  cancelCompetingScrollJobs();
  if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  return scheduleBookingNavAfterRender(target, {
    focusHeading: options?.focusHeading ?? true,
    correctAfterMs: options?.correctAfterMs ?? 150,
    behavior: options?.behavior,
    clearancePx: options?.clearancePx,
  });
}

/**
 * After iPhone time picker Done/blur: land on the next booking block
 * (flight number when shown, otherwise YOUR JOURNEY) without covering
 * "Continue to your details".
 *
 * Aligns the target under the sticky header, then clamps so
 * `#quote-step2-next` (Back + Continue) stays fully visible. Does not focus
 * headings — iOS focus scrolling was overshooting past the CTA.
 */
export function scrollJourneySummaryAfterTimeConfirm(
  summary: BookingNavTargetId | HTMLElement | string | null | undefined,
  continueCta: BookingNavTargetId | HTMLElement | string | null | undefined = "quote-step2-next",
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  cancelCompetingScrollJobs();

  const generation = getScrollJobGeneration();
  let cancelled = false;
  let raf2 = 0;

  const apply = () => {
    if (cancelled || !isScrollJobGenerationCurrent(generation)) return;

    const summaryEl = resolveBookingNavElement(summary);
    if (!summaryEl) return;

    const clearancePx = HEADER_CLEARANCE_PX;
    let nextTop = computeScrollTopBelowHeader(summaryEl, clearancePx);

    const ctaEl = resolveBookingNavElement(continueCta);
    if (ctaEl) {
      const viewportHeight =
        window.visualViewport?.height != null
          ? Math.round(window.visualViewport.height + (window.visualViewport.offsetTop ?? 0))
          : window.innerHeight;
      const bottomPad = 16;
      const ctaRect = ctaEl.getBoundingClientRect();
      const ctaBottomDoc = window.scrollY + ctaRect.bottom;
      // Do not scroll so far that Continue sits below the fold.
      const maxKeepCtaInView = Math.max(0, Math.round(ctaBottomDoc - viewportHeight + bottomPad));
      // Do not scroll so far that Continue is covered by the sticky header.
      const headerBottom = getHeaderBottomPx();
      const ctaTopDoc = window.scrollY + ctaRect.top;
      const maxKeepCtaBelowHeader = Math.max(
        0,
        Math.round(ctaTopDoc - (headerBottom + clearancePx)),
      );
      nextTop = Math.min(nextTop, maxKeepCtaInView, maxKeepCtaBelowHeader);
    }

    nextTop = Math.max(0, nextTop);
    const distance = Math.abs(window.scrollY - nextTop);
    if (distance <= RESULTS_CORRECTION_TOLERANCE_PX) return;

    const behavior = scrollBehaviorForDistance(distance);
    window.scrollTo({ top: nextTop, behavior });
  };

  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      apply();
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
 * Mobile Express free-area acknowledgement → reveal Book Now with a short, calm scroll.
 *
 * Only scrolls by the amount the Book Now CTA is still below the fold — does not
 * centre the page (that felt like “too high”). One smooth move, plus a single
 * quiet correction if iOS undoes it; no multi-retry judder.
 */
export function scheduleScrollToBookNowAfterExpressAck(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const generation = getScrollJobGeneration();
  let cancelled = false;
  let raf2 = 0;
  let correctTimer = 0;

  const resolveCta = (): HTMLElement | null => {
    const buttons = document.querySelectorAll<HTMLElement>("#quote-book-now-button");
    for (const button of buttons) {
      if (button.getClientRects().length > 0) return button;
    }
    const sections = document.querySelectorAll<HTMLElement>("#quote-step1-next");
    for (const section of sections) {
      if (section.getClientRects().length > 0) return section;
    }
    return null;
  };

  /** Pixels the CTA still sits below the comfortable bottom of the viewport. */
  const overflowBelowFoldPx = (element: HTMLElement): number => {
    const rect = element.getBoundingClientRect();
    const bottomGap = Math.max(20, 12 + (window.visualViewport?.offsetTop ?? 0));
    const comfortableBottom = window.innerHeight - bottomGap;
    return Math.round(rect.bottom - comfortableBottom);
  };

  const revealBookNow = (behavior: ScrollBehavior): boolean => {
    const element = resolveCta();
    if (!element) return false;

    const overflow = overflowBelowFoldPx(element);
    // Already fully visible with a little breathing room — do nothing.
    if (overflow <= 8) return false;

    const html = document.documentElement;
    const prevAnchor = html.style.overflowAnchor;
    html.style.overflowAnchor = "none";

    // Minimal move: only as far as needed to bring Book Now onto the screen.
    window.scrollBy({ top: overflow + 12, behavior });

    window.setTimeout(() => {
      html.style.overflowAnchor = prevAnchor;
    }, 400);

    return true;
  };

  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }

  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";

  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
      revealBookNow(behavior);

      // One delayed correction only — avoids the judder from stacked smooth scrolls.
      correctTimer = window.setTimeout(() => {
        if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
        const element = resolveCta();
        if (!element) return;
        if (overflowBelowFoldPx(element) > 24) {
          revealBookNow("auto");
        }
      }, 320);
    });
  });

  const cancel = () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
    if (correctTimer) window.clearTimeout(correctTimer);
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
