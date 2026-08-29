/**
 * Step 1 quote-funnel diagnostic events (GA4 / dataLayer).
 * Diagnostic only — never sends Google Ads conversion `send_to`.
 * Requires the same marketing/measurement cookie consent as other browser measurement.
 */

import { hasMarketingCookieConsent } from "@/lib/cookie-consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const QUOTE_FUNNEL_EVENTS = {
  TOOL_VIEWED: "quote_tool_viewed",
  STARTED: "quote_started",
  PICKUP_PLACE_SELECTED: "pickup_place_selected",
  DROPOFF_PLACE_SELECTED: "dropoff_place_selected",
  REQUEST_CLICKED: "quote_request_clicked",
  VALIDATION_ERROR: "quote_validation_error",
  MANUAL_ENQUIRY: "quote_manual_enquiry",
  WHATSAPP_BOOKING_HELP_CLICK: "whatsapp_booking_help_click",
  START_NEW_QUOTE_CLICK: "start_new_quote_click",
} as const;

export type QuoteFunnelEventName =
  (typeof QUOTE_FUNNEL_EVENTS)[keyof typeof QUOTE_FUNNEL_EVENTS];

/** Safe, non-PII diagnostic parameters only. */
export type QuoteFunnelParams = {
  quote_step?: number;
  journey_intent?: string | null;
  airport_code?: string | null;
  passengers?: number | null;
  suitcases?: number | null;
  return_journey?: boolean | null;
  page_type?: string | null;
  cta?: string | null;
  validation_reason?: string | null;
  pricing_path?: string | null;
};

const VIEWED_PREFIX = "matni-funnel-viewed:";
const STARTED_PREFIX = "matni-funnel-started:";
const MANUAL_PREFIX = "matni-funnel-manual:";
const PLACE_PREFIX = "matni-funnel-place:";

function ensureGtagStub(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }
}

function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function cleanParams(params: QuoteFunnelParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  out.quote_step = params.quote_step ?? 1;
  return out;
}

/**
 * Push a diagnostic GA4 event. No Ads `send_to`. Honours measurement consent.
 * Returns false when consent is missing or the browser is unavailable.
 */
export function trackQuoteFunnelEvent(
  eventName: QuoteFunnelEventName,
  params: QuoteFunnelParams = {},
): boolean {
  if (typeof window === "undefined" || !hasMarketingCookieConsent()) {
    return false;
  }

  ensureGtagStub();
  const payload = cleanParams(params);

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...payload });

  if (typeof window.gtag === "function") {
    try {
      window.gtag("event", eventName, payload);
    } catch {
      // Tracking must never break the quote UI.
    }
  }

  return true;
}

export function trackQuoteToolViewed(params: QuoteFunnelParams = {}): boolean {
  const key = `${VIEWED_PREFIX}${params.page_type?.trim() || "home"}`;
  if (sessionGet(key)) return false;
  const ok = trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.TOOL_VIEWED, params);
  if (ok) sessionSet(key, "1");
  return ok;
}

/** Once per quote attempt (caller supplies a stable attemptId). */
export function trackQuoteStarted(
  attemptId: string,
  params: QuoteFunnelParams = {},
): boolean {
  const id = attemptId.trim();
  if (!id) return false;
  const key = `${STARTED_PREFIX}${id}`;
  if (sessionGet(key)) return false;
  const ok = trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.STARTED, params);
  if (ok) sessionSet(key, "1");
  return ok;
}

export function trackPickupPlaceSelected(
  attemptId: string,
  placeId: string,
  params: QuoteFunnelParams = {},
): boolean {
  const pid = placeId.trim();
  if (!pid || !attemptId.trim()) return false;
  const key = `${PLACE_PREFIX}pickup:${attemptId}:${pid}`;
  if (sessionGet(key)) return false;
  const ok = trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.PICKUP_PLACE_SELECTED, params);
  if (ok) sessionSet(key, "1");
  return ok;
}

export function trackDropoffPlaceSelected(
  attemptId: string,
  placeId: string,
  params: QuoteFunnelParams = {},
): boolean {
  const pid = placeId.trim();
  if (!pid || !attemptId.trim()) return false;
  const key = `${PLACE_PREFIX}dropoff:${attemptId}:${pid}`;
  if (sessionGet(key)) return false;
  const ok = trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.DROPOFF_PLACE_SELECTED, params);
  if (ok) sessionSet(key, "1");
  return ok;
}

export function trackQuoteRequestClicked(params: QuoteFunnelParams = {}): boolean {
  return trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.REQUEST_CLICKED, params);
}

export function trackQuoteValidationError(
  reason: string,
  params: QuoteFunnelParams = {},
): boolean {
  const validation_reason = reason.trim().slice(0, 80);
  if (!validation_reason) return false;
  return trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.VALIDATION_ERROR, {
    ...params,
    validation_reason,
  });
}

export function trackQuoteManualEnquiry(
  attemptId: string,
  params: QuoteFunnelParams = {},
): boolean {
  const id = attemptId.trim();
  if (!id) return false;
  const key = `${MANUAL_PREFIX}${id}`;
  if (sessionGet(key)) return false;
  const ok = trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.MANUAL_ENQUIRY, params);
  if (ok) sessionSet(key, "1");
  return ok;
}

/** Error-help WhatsApp support click (diagnostic; no Ads send_to). */
export function trackWhatsAppBookingHelpClick(params: QuoteFunnelParams = {}): boolean {
  return trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.WHATSAPP_BOOKING_HELP_CLICK, params);
}

/** Confirmed Start New Quote reset (diagnostic; no Ads send_to). */
export function trackStartNewQuoteClick(params: QuoteFunnelParams = {}): boolean {
  return trackQuoteFunnelEvent(QUOTE_FUNNEL_EVENTS.START_NEW_QUOTE_CLICK, params);
}

/** Test helper — clears funnel dedupe keys from session storage. */
export function resetQuoteFunnelAnalyticsForTests(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (
        key &&
        (key.startsWith(VIEWED_PREFIX) ||
          key.startsWith(STARTED_PREFIX) ||
          key.startsWith(MANUAL_PREFIX) ||
          key.startsWith(PLACE_PREFIX))
      ) {
        keys.push(key);
      }
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
