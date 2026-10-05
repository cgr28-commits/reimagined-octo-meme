/**
 * Shared booking-form navigation: scroll + focus after step/CTA changes.
 * Measures the live fixed header — does not rely on URL hash alone.
 *
 * Quote stages use stable ids:
 * - #journey-type-selector
 * - #passenger-luggage-section
 * - #quote-route-summary
 */

import { detectMobileDevice } from "@/lib/device";
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
  | "quote-section-schedule"
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
    /**
     * Scroll in this turn when the target is already in the DOM (e.g. after
     * flushSync). Skips the two-frame wait so the tap does not feel frozen.
     */
    immediate?: boolean;
  },
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const generation = getScrollJobGeneration();
  let cancelled = false;
  let raf1 = 0;
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

  const scheduleCorrection = () => {
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
  };

  const applyNow = (behavior?: ScrollBehavior) => {
    if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
    apply(behavior);
    scheduleCorrection();
  };

  if (options?.immediate && resolveBookingNavElement(target)) {
    applyNow(options?.behavior);
  } else {
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        applyNow(options?.behavior);
      });
    });
  }

  const cancel = () => {
    cancelled = true;
    if (raf1) window.cancelAnimationFrame(raf1);
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
    immediate?: boolean;
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
    immediate: options?.immediate,
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

/** Pause after the last luggage choice so the selection can register. */
export const QUOTE_REVEAL_PAUSE_MS = 350;
/** Controlled glide. Native smooth scroll is too fast and is not used. */
export const QUOTE_REVEAL_SCROLL_MS = 720;
/** Restrained fade/raise on the new quote card. */
export const QUOTE_REVEAL_MOTION_MS = 420;
/** Space kept between the sticky header and the price, and below Book Now. */
export const QUOTE_REVEAL_BREATHING_PX = 28;
const REVEAL_EDGE_TOLERANCE_PX = 8;

export type QuoteRevealMetrics = {
  scrollY: number;
  /** Visual viewport height at the moment the glide starts. */
  viewportHeight: number;
  headerBottom: number;
  cardTop: number;
  cardBottom: number;
  priceTop: number;
  bookBottom: number;
  layout: "mobile" | "desktop";
  clearancePx?: number;
  bottomPad?: number;
  /** Home-indicator inset. Added below Book Now, not double-counted in the header. */
  safeAreaBottom?: number;
  /** Largest scroll offset the document can actually reach. */
  maxScroll?: number;
};

/** Gentle ease-in-out. Slow at the start and the end. */
export function quoteRevealEaseInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - ((-2 * clamped + 2) ** 3) / 2;
}

/**
 * Resting scroll offset for the first quote reveal.
 * Frames the rendered price and Book Now with breathing room.
 * Does not pin the top of the vehicle image when that would push Book Now down.
 * Returns null when both are already comfortably on screen.
 */
export function computeQuoteRevealScrollTop(metrics: QuoteRevealMetrics): number | null {
  const breathing = metrics.clearancePx ?? QUOTE_REVEAL_BREATHING_PX;
  const bottomBreathing = metrics.bottomPad ?? QUOTE_REVEAL_BREATHING_PX;
  const safeAreaBottom = metrics.safeAreaBottom ?? 0;
  const usableTop = metrics.headerBottom + breathing;
  const usableBottom = metrics.viewportHeight - bottomBreathing - safeAreaBottom;
  const available = usableBottom - usableTop;
  const cluster = metrics.bookBottom - metrics.priceTop;

  const comfortablyVisible =
    metrics.priceTop >= usableTop - REVEAL_EDGE_TOLERANCE_PX &&
    metrics.bookBottom <= usableBottom + REVEAL_EDGE_TOLERANCE_PX;
  if (comfortablyVisible) return null;

  let delta: number;
  if (cluster <= available) {
    const idealPriceTop = usableTop + (available - cluster) / 2;
    delta = metrics.priceTop - idealPriceTop;
  } else {
    delta = metrics.bookBottom - usableBottom;
  }

  const maxScroll = metrics.maxScroll ?? Number.POSITIVE_INFINITY;
  const nextTop = Math.min(maxScroll, Math.max(0, Math.round(metrics.scrollY + delta)));
  return Math.abs(nextTop - metrics.scrollY) <= REVEAL_EDGE_TOLERANCE_PX ? null : nextTop;
}

function readSafeAreaBottom(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;bottom:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return Math.max(0, Math.round(value));
}

/**
 * Visible viewport at this instant.
 * Height is the visual viewport only. offsetTop is subtracted from element
 * positions so the address bar is not treated as extra visible space.
 */
function readVisualViewport(): { height: number; offsetTop: number } {
  const visual = window.visualViewport;
  if (visual && visual.height > 0) {
    const offsetTop = Number.isFinite(visual.offsetTop) ? visual.offsetTop : 0;
    return { height: Math.round(visual.height), offsetTop };
  }
  return { height: window.innerHeight, offsetTop: 0 };
}

/**
 * One measurement of the quote that is actually on screen.
 * Uses the visual viewport, not window.innerHeight plus a toolbar offset.
 */
function measureQuoteReveal(): QuoteRevealMetrics | null {
  const card = document.getElementById("quote-selected-vehicle-card");
  if (!(card instanceof HTMLElement) || card.getClientRects().length === 0) return null;
  const price = card.querySelector<HTMLElement>("[data-quote-result-price]");
  const book = card.querySelector<HTMLElement>("#quote-book-now-button");
  if (!price || !book || price.getClientRects().length === 0 || book.getClientRects().length === 0) {
    return null;
  }
  const visual = readVisualViewport();
  const cardRect = card.getBoundingClientRect();
  const priceRect = price.getBoundingClientRect();
  const bookRect = book.getBoundingClientRect();
  const layoutClientHeight = document.documentElement.clientHeight || visual.height;
  const maxScroll = Math.max(
    0,
    Math.round(document.documentElement.scrollHeight - Math.min(visual.height, layoutClientHeight)),
  );
  return {
    scrollY: window.scrollY,
    viewportHeight: visual.height,
    headerBottom: Math.round(getHeaderBottomPx() - visual.offsetTop),
    cardTop: cardRect.top - visual.offsetTop,
    cardBottom: cardRect.bottom - visual.offsetTop,
    priceTop: priceRect.top - visual.offsetTop,
    bookBottom: bookRect.bottom - visual.offsetTop,
    safeAreaBottom: readSafeAreaBottom(),
    maxScroll,
    layout: detectMobileDevice() ? "mobile" : "desktop",
  };
}

/**
 * First completed quote only.
 * Waits so the luggage choice can register, measures the settled quote once,
 * then glides there. Does not use native smooth scrolling, and does not
 * correct the position with a second jump. A touch, swipe, wheel, or scroll
 * key cancels the glide immediately.
 */
export function scheduleQuoteRevealScroll(handlers: {
  onConsume: () => void;
  onRetry: () => void;
  onReveal: () => void;
}): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let stopped = false;
  let consumed = false;
  let userInterrupted = false;
  let timer = 0;
  let frame = 0;
  let restoreMotion = () => {};

  const consume = () => {
    if (consumed) return;
    consumed = true;
    handlers.onConsume();
  };

  const haltMotion = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    restoreMotion();
    restoreMotion = () => {};
  };

  const onUserMove = () => {
    if (stopped || userInterrupted) return;
    userInterrupted = true;
    haltMotion();
    stopListening();
    consume();
  };

  const onKey = (event: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
    onUserMove();
  };

  const stopListening = () => {
    window.removeEventListener("wheel", onUserMove);
    window.removeEventListener("touchstart", onUserMove);
    window.removeEventListener("touchmove", onUserMove);
    window.removeEventListener("keydown", onKey);
  };

  window.addEventListener("wheel", onUserMove, { passive: true });
  window.addEventListener("touchstart", onUserMove, { passive: true });
  window.addEventListener("touchmove", onUserMove, { passive: true });
  window.addEventListener("keydown", onKey);

  const glideTo = (target: number) => {
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    const startY = window.scrollY;
    const change = target - startY;
    restoreMotion = () => {
      root.style.scrollBehavior = previousBehavior;
    };

    if (prefersReducedMotion() || Math.abs(change) <= REVEAL_EDGE_TOLERANCE_PX) {
      if (Math.abs(change) > 1) window.scrollTo(0, target);
      haltMotion();
      stopListening();
      return;
    }

    const started = performance.now();
    const tick = (now: number) => {
      if (stopped || userInterrupted) {
        haltMotion();
        stopListening();
        return;
      }
      const progress = Math.min(1, (now - started) / QUOTE_REVEAL_SCROLL_MS);
      const y = progress >= 1 ? target : Math.round(startY + change * quoteRevealEaseInOut(progress));
      window.scrollTo(0, y);
      if (stopped || userInterrupted) {
        haltMotion();
        stopListening();
        return;
      }
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        haltMotion();
        stopListening();
      }
    };
    frame = window.requestAnimationFrame(tick);
  };

  const begin = () => {
    if (stopped || userInterrupted) {
      if (userInterrupted) consume();
      stopListening();
      return;
    }
    const metrics = measureQuoteReveal();
    if (!metrics) {
      consume();
      stopListening();
      return;
    }
    handlers.onReveal();
    consume();
    const nextTop = computeQuoteRevealScrollTop(metrics);
    if (nextTop == null) {
      stopListening();
      return;
    }
    glideTo(nextTop);
  };

  timer = window.setTimeout(() => {
    if (stopped || userInterrupted) {
      if (userInterrupted) consume();
      stopListening();
      return;
    }
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(begin);
    });
  }, QUOTE_REVEAL_PAUSE_MS);

  const cancel = () => {
    stopped = true;
    window.clearTimeout(timer);
    haltMotion();
    stopListening();
    if (!consumed) handlers.onRetry();
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
