/**
 * Browser-side Google Ads / Consent Mode helpers.
 * Safe to import from client components (guards on window).
 */

import {
  ADS_EVENT_BOOKING_REQUEST_SUBMITTED,
  ADS_EVENT_PURCHASE,
  ADS_EVENT_QUOTE_GENERATED,
  getGoogleAdsConfig,
  type AdsQuotePageType,
} from "@/lib/google-ads";
import { hasMarketingCookieConsent } from "@/lib/cookie-consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const FIRED_QUOTE_PREFIX = "matni-ads-fired-quote:";
const FIRED_BOOKING_REQUEST_PREFIX = "matni-ads-fired-booking-request:";
const FIRED_PURCHASE_PREFIX = "matni-ads-fired-purchase:";

export type AdsUserData = {
  email?: string;
  phone?: string;
};

export type AdsConversionPayload = {
  value?: number;
  currency?: string;
  transactionId?: string;
  bookingReference?: string;
  airport?: string;
  journeyType?: string;
  passengers?: number;
  returnJourney?: boolean;
  /** Custom page context — e.g. emerge_belfast. Never send PII here. */
  pageType?: AdsQuotePageType;
  /**
   * Enhanced conversions (email/phone). Off by default for quote_generated /
   * EMERGE so Ads events stay free of personal information unless explicitly enabled.
   */
  includeUserData?: boolean;
  userData?: AdsUserData;
};

function ensureGtagStub(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }
}

/** Consent Mode v2 defaults — deny until the visitor accepts measurement cookies. */
export function applyConsentDefault(): void {
  ensureGtagStub();
  if (typeof window.gtag !== "function") return;
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    wait_for_update: 500,
  });
}

/** Update Consent Mode after the visitor accepts or rejects measurement cookies. */
export function updateGoogleConsent(granted: boolean): void {
  ensureGtagStub();
  if (typeof window.gtag !== "function") return;
  const value = granted ? "granted" : "denied";
  window.gtag("consent", "update", {
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
    analytics_storage: value,
  });
}

export function normalizeEmailForAds(email?: string): string | undefined {
  const value = email?.trim().toLowerCase();
  return value || undefined;
}

/** Best-effort E.164 for UK mobiles (enhanced conversions). */
export function normalizePhoneForAds(phone?: string): string | undefined {
  if (!phone?.trim()) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 10) return `+44${digits}`;
  return digits.startsWith("+") ? phone.trim() : `+${digits}`;
}

/**
 * Attach enhanced-conversion user data when marketing consent is granted.
 * gtag hashes plaintext email/phone before sending to Google.
 */
export function setEnhancedConversionUserData(userData?: AdsUserData): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  if (!hasMarketingCookieConsent() || !userData) return;

  const email = normalizeEmailForAds(userData.email);
  const phone_number = normalizePhoneForAds(userData.phone);
  if (!email && !phone_number) return;

  const payload: Record<string, string> = {};
  if (email) payload.email = email;
  if (phone_number) payload.phone_number = phone_number;
  window.gtag("set", "user_data", payload);
}

type DedupeStorage = "session" | "local";

function eventStorage(kind: DedupeStorage): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function alreadyFired(storageKey: string, kind: DedupeStorage): boolean {
  if (typeof window === "undefined") return true;
  try {
    return eventStorage(kind)?.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function markFired(storageKey: string, kind: DedupeStorage): void {
  if (typeof window === "undefined") return;
  try {
    eventStorage(kind)?.setItem(storageKey, "1");
  } catch {
    // Ignore storage failures.
  }
}

function fireTrackedEvent(options: {
  sendTo: string;
  /**
   * Send a labelled Google Ads conversion directly as well as emitting the
   * named dataLayer event. Disable this when the named event is already wired
   * to the same Ads destination in Google tag / GTM.
   */
  directAds?: boolean;
  eventName: string;
  params: Record<string, unknown>;
  dedupeKey: string;
  dedupeStorage: DedupeStorage;
}): boolean {
  if (typeof window === "undefined" || !hasMarketingCookieConsent()) return false;
  if (alreadyFired(options.dedupeKey, options.dedupeStorage)) return true;

  ensureGtagStub();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: options.eventName, ...options.params });

  // Direct Ads conversion is optional. Named events are emitted exactly once to
  // dataLayer for GTM/GA4 even when a verified Ads label has not been configured.
  if (options.directAds !== false && options.sendTo && typeof window.gtag === "function") {
    window.gtag("event", "conversion", {
      ...options.params,
      send_to: options.sendTo,
    });
  }

  markFired(options.dedupeKey, options.dedupeStorage);
  return true;
}

function isValidQuoteValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Google Ads quote conversion (`quote_generated` + optional conversion send_to).
 * Call only after a successful fixed-price quote is calculated and displayed.
 * Requires a positive numeric value and a unique transaction/quote ID.
 * Never call on page load, button click alone, validation failure, or API failure.
 */
export function trackRequestQuoteConversion(options: AdsConversionPayload = {}): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (!hasMarketingCookieConsent()) {
    return false;
  }

  // Genuine priced quote only — no fire without a valid amount.
  if (!isValidQuoteValue(options.value)) {
    return false;
  }

  const transactionId = options.transactionId?.trim();
  if (!transactionId) {
    // Without a unique ID, refreshes / double-clicks can double-count.
    return false;
  }

  const currency = options.currency?.trim() || "GBP";
  const pageType = options.pageType?.trim() || undefined;
  const dedupeKey = `${FIRED_QUOTE_PREFIX}${transactionId}`;
  const config = getGoogleAdsConfig();

  const shared: Record<string, unknown> = {
    value: options.value,
    currency,
    transaction_id: transactionId,
  };
  if (pageType) {
    shared.page_type = pageType;
  }
  if (options.airport?.trim()) shared.airport = options.airport.trim();
  if (options.journeyType?.trim()) shared.journey_type = options.journeyType.trim();
  if (
    typeof options.passengers === "number" &&
    Number.isInteger(options.passengers) &&
    options.passengers > 0
  ) {
    shared.passengers = options.passengers;
  }
  if (typeof options.returnJourney === "boolean") {
    shared.return_journey = options.returnJourney;
  }

  return fireTrackedEvent({
    sendTo: config.quoteSendTo,
    // Production Google tag already maps quote_generated to the Request quote
    // destination. A second direct `conversion` send_to duplicates the hit.
    directAds: false,
    eventName: ADS_EVENT_QUOTE_GENERATED,
    params: shared,
    dedupeKey,
    dedupeStorage: "session",
  });
}

/** Fresh calculations receive a new transaction ID; retained for older callers. */
export function resetRequestQuoteConversion(): void {
  // No module-level latch: transaction ID + session storage provide deduplication.
}

/**
 * @deprecated Prefer trackRequestQuoteConversion — kept for callers during transition.
 */
export function trackRequestQuote(options: AdsConversionPayload = {}): boolean {
  return trackRequestQuoteConversion(options);
}

/** Fire once after the Worker confirms that a booking request was persisted. */
export function trackBookingRequestSubmitted(options: AdsConversionPayload): boolean {
  const config = getGoogleAdsConfig();
  const bookingReference = options.bookingReference?.trim() || options.transactionId?.trim();
  if (!bookingReference || !hasMarketingCookieConsent()) return false;

  const params: Record<string, unknown> = {
    booking_reference: bookingReference,
    transaction_id: bookingReference,
    currency: options.currency?.trim() || "GBP",
  };
  if (isValidQuoteValue(options.value)) params.value = options.value;
  if (options.airport?.trim()) params.airport = options.airport.trim();
  if (options.journeyType?.trim()) params.journey_type = options.journeyType.trim();

  return fireTrackedEvent({
    sendTo: config.bookingRequestSendTo,
    eventName: ADS_EVENT_BOOKING_REQUEST_SUBMITTED,
    params,
    dedupeKey: `${FIRED_BOOKING_REQUEST_PREFIX}${bookingReference}`,
    dedupeStorage: "local",
  });
}

/** Fire a GA4-standard purchase only from a SumUp-verified server result. */
export function trackPurchase(options: AdsConversionPayload): boolean {
  const config = getGoogleAdsConfig();
  const transactionId = options.transactionId?.trim();
  if (!transactionId || !isValidQuoteValue(options.value) || !hasMarketingCookieConsent()) {
    return false;
  }

  if (options.includeUserData === true) {
    ensureGtagStub();
    setEnhancedConversionUserData(options.userData);
  }

  const params: Record<string, unknown> = {
    transaction_id: transactionId,
    value: options.value,
    currency: options.currency?.trim() || "GBP",
  };
  if (options.bookingReference?.trim()) {
    params.booking_reference = options.bookingReference.trim();
  }

  return fireTrackedEvent({
    sendTo: config.purchaseSendTo,
    eventName: ADS_EVENT_PURCHASE,
    params,
    dedupeKey: `${FIRED_PURCHASE_PREFIX}${transactionId}`,
    dedupeStorage: "local",
  });
}

/** @deprecated Paid bookings now use the standard purchase event. */
export function trackBookingComplete(options: AdsConversionPayload): boolean {
  return trackPurchase(options);
}

export function isGtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/** Test helper — current once-per-interaction latch. */
export function hasRequestQuoteConversionBeenSent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(FIRED_QUOTE_PREFIX)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Stable client-side quote ID for Ads deduplication when no booking reference yet. */
export function createQuoteTransactionId(prefix = "quote"): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}
