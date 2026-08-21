/**
 * Shared booking-form navigation: scroll + focus after step/CTA changes.
 * Measures the live fixed header height (+ clearance) — does not rely on URL hash alone.
 */

export type BookingNavTargetId =
  | "quote"
  | "step1-journey-details"
  | "step2-travel-details"
  | "step3-customer-details"
  | "quote-results-summary"
  | "quote-price-summary"
  | "quote-step1-next"
  | "quote-step2-next";

export type QuoteStepNavTarget = 1 | 2 | 3;

/** Keep “Your Route” ~12–16px below the fixed header (14px midpoint). */
const HEADER_CLEARANCE_PX = 14;
const LONG_JUMP_PX = 900;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Live fixed-header offset + clearance so targets are never tucked under the bar. */
export function getFixedHeaderOffsetPx(): number {
  if (typeof document === "undefined") return 144;
  const header = document.querySelector("header.fixed, header[class*='fixed']");
  const height = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
  const safeTop =
    typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("top: env(safe-area-inset-top)")
      ? 0
      : 0;
  return Math.max(96, Math.round(height + HEADER_CLEARANCE_PX + safeTop));
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
 * Scroll a booking target into view using the measured header offset.
 * Optionally focus a heading with preventScroll so mobile keyboards stay closed.
 */
export function scrollBookingTargetIntoView(
  target: BookingNavTargetId | HTMLElement | string | null | undefined,
  options?: {
    focusHeading?: boolean;
    behavior?: ScrollBehavior;
  },
): void {
  const element = resolveBookingNavElement(target);
  if (!element || typeof window === "undefined") return;

  const headerOffset = getFixedHeaderOffsetPx();
  const rect = element.getBoundingClientRect();
  const absoluteTop = rect.top + window.scrollY;
  const nextTop = Math.max(0, absoluteTop - headerOffset);
  const distance = Math.abs(window.scrollY - nextTop);
  const behavior = options?.behavior ?? scrollBehaviorForDistance(distance);

  window.scrollTo({ top: nextTop, behavior });

  if (options?.focusHeading) {
    const heading =
      element.matches("h1,h2,h3,h4,[data-booking-nav-heading]")
        ? element
        : element.querySelector<HTMLElement>("h2,h3,[data-booking-nav-heading]");
    if (heading) {
      if (!heading.hasAttribute("tabindex")) {
        heading.tabIndex = -1;
      }
      try {
        heading.focus({ preventScroll: true });
      } catch {
        heading.focus();
      }
    }
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
  },
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;
  let raf2 = 0;
  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled) return;
      scrollBookingTargetIntoView(target, options);
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
  };
}

/** Map quote step number → stable section id. */
export function quoteStepTargetId(step: QuoteStepNavTarget): BookingNavTargetId {
  if (step === 2) return "step2-travel-details";
  if (step === 3) return "step3-customer-details";
  return "step1-journey-details";
}

/**
 * @deprecated Prefer scheduleBookingNavAfterRender — kept for existing imports/tests.
 * Now scrolls on all viewports (header-aware), not mobile-only.
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

  // Prefer the associated control when we only found an error message node.
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
