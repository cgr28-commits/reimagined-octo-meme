/**
 * Shared booking-form navigation: scroll + focus after step/CTA changes.
 * Measures the live fixed header — does not rely on URL hash alone.
 *
 * Quote stages use stable ids:
 * - #journey-type-selector
 * - #passenger-luggage-section
 * - #quote-route-summary
 * - #quote-actions (Book Now / Save / Start New Quote confirm)
 * - #quote-section-journey (initial journey intent buttons)
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
  | "quote-actions"
  | "quote-section-journey"
  | "quote-step1-next"
  | "quote-step2-next"
  | "quote-availability-confirmation";

export type QuoteStepNavTarget = 1 | 2 | 3;

/** Keep section tops ~12–16px below the fixed header. */
export const HEADER_CLEARANCE_PX = 16;
const LONG_JUMP_PX = 900;
const RESULTS_CORRECTION_MS = 150;
const RESULTS_CORRECTION_TOLERANCE_PX = 4;
const ACTIONS_BOTTOM_CLEARANCE_PX = 16;
const ACTIONS_CLIP_TOLERANCE_PX = 4;

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

/** Visible viewport band using visualViewport when available (iOS Safari toolbar). */
export function getVisibleViewportBand(): {
  offsetTop: number;
  height: number;
  bottom: number;
} {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const offsetTop = vv ? Math.round(vv.offsetTop) : 0;
  const height = vv ? Math.round(vv.height) : typeof window !== "undefined" ? window.innerHeight : 800;
  return { offsetTop, height, bottom: offsetTop + height };
}

/**
 * Minimum scrollY so `#quote-actions` (or similar) is fully visible between the
 * fixed header and the bottom of the visual viewport, with ~16px below the last button.
 * Returns null when no scroll is needed.
 */
export function computeScrollTopToRevealActions(
  element: HTMLElement,
  options?: {
    bottomClearancePx?: number;
    topClearancePx?: number;
  },
): number | null {
  if (typeof window === "undefined") return null;

  const bottomClearance = options?.bottomClearancePx ?? ACTIONS_BOTTOM_CLEARANCE_PX;
  const topClearance = options?.topClearancePx ?? HEADER_CLEARANCE_PX;
  const headerBottom = getHeaderBottomPx();
  const { offsetTop, bottom: viewportBottom } = getVisibleViewportBand();
  const visibleTop = Math.max(headerBottom + topClearance, offsetTop + topClearance);
  const visibleBottom = viewportBottom - bottomClearance;
  const available = visibleBottom - visibleTop;
  if (available <= 0) return null;

  const rect = element.getBoundingClientRect();
  const fullyVisible =
    rect.top >= visibleTop - ACTIONS_CLIP_TOLERANCE_PX &&
    rect.bottom <= visibleBottom + ACTIONS_CLIP_TOLERANCE_PX;
  if (fullyVisible) return null;

  let delta = 0;
  if (rect.height <= available) {
    // Fit the whole action area in the visible band; prefer keeping the bottom clear.
    if (rect.bottom > visibleBottom) {
      delta = rect.bottom - visibleBottom;
    } else if (rect.top < visibleTop) {
      delta = rect.top - visibleTop;
    }
    const topAfter = rect.top - delta;
    if (topAfter < visibleTop) {
      delta = rect.top - visibleTop;
    }
  } else {
    // Taller than the band — prioritise the bottom confirmation buttons.
    delta = rect.bottom - visibleBottom;
  }

  if (Math.abs(delta) <= ACTIONS_CLIP_TOLERANCE_PX) return null;
  return Math.max(0, Math.round(window.scrollY + delta));
}

/**
 * After expanding Start New Quote confirmation, scroll the minimum distance so
 * Book Now / Save Quote / Start New Quote / Keep Current Quote are all visible.
 * Does not clear the quote. Uses behavior: "auto" (no scrollIntoView).
 */
export function scheduleRevealQuoteActionsScroll(
  target: BookingNavTargetId | string = "quote-actions",
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;
  let raf2 = 0;
  let correctionTimer = 0;

  const applyScroll = () => {
    const element = resolveBookingNavElement(target);
    if (!element || cancelled) return;
    const nextTop = computeScrollTopToRevealActions(element);
    if (nextTop == null) return;
    window.scrollTo({ top: nextTop, behavior: "auto" });
  };

  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled) return;
      applyScroll();
      correctionTimer = window.setTimeout(() => {
        if (cancelled) return;
        const element = resolveBookingNavElement(target);
        if (!element) return;
        const { bottom: viewportBottom } = getVisibleViewportBand();
        const rect = element.getBoundingClientRect();
        const clipped =
          rect.bottom > viewportBottom - ACTIONS_BOTTOM_CLEARANCE_PX + ACTIONS_CLIP_TOLERANCE_PX;
        if (!clipped) return;
        const desired = computeScrollTopToRevealActions(element);
        if (desired == null) return;
        if (Math.abs(window.scrollY - desired) > ACTIONS_CLIP_TOLERANCE_PX) {
          window.scrollTo({ top: desired, behavior: "auto" });
        }
      }, RESULTS_CORRECTION_MS);
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
    if (correctionTimer) window.clearTimeout(correctionTimer);
  };
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
