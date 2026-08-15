/**
 * Browser-side Google Ads / Consent Mode helpers.
 * Safe to import from client components (guards on window).
 */

import {
  ADS_EVENT_BOOKING_COMPLETE,
  ADS_EVENT_QUOTE_GENERATED,
  ADS_EVENT_REQUEST_QUOTE,
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
const FIRED_BOOKING_PREFIX = "matni-ads-fired-booking:";

/** Once-per successful quote interaction (module scope). */
let requestQuoteConversionSent = false;

export type AdsUserData = {
  email?: string;
  phone?: string;
};

export type AdsConversionPayload = {
  value?: number;
  currency?: string;
  transactionId?: string;
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
    // We do not run general site analytics; keep analytics storage denied.
    analytics_storage: "denied",
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

function alreadyFired(storageKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function markFired(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Ignore storage failures.
  }
}

function fireAdsConversion(options: {
  sendTo: string;
  eventName: string;
  value?: number;
  currency: string;
  transactionId?: string;
  userData?: AdsUserData;
}): boolean {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return false;
  }
  if (!hasMarketingCookieConsent()) {
    return false;
  }

  setEnhancedConversionUserData(options.userData);

  const shared: Record<string, unknown> = {
    currency: options.currency,
  };
  if (typeof options.value === "number" && Number.isFinite(options.value)) {
    shared.value = options.value;
  }
  if (options.transactionId?.trim()) {
    shared.transaction_id = options.transactionId.trim();
  }

  window.gtag("event", options.eventName, { ...shared });

  if (options.sendTo) {
    window.gtag("event", "conversion", {
      ...shared,
      send_to: options.sendTo,
    });
  }

  return true;
}

function isValidQuoteValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Google Ads quote conversion (`quote_generated` + conversion send_to).
 * Call only after a successful priced quote is confirmed (`#quoteResult`).
 * Requires a positive numeric value and a unique transaction/quote ID.
 * Never call on page load, button click alone, validation failure, or API failure.
 */
export function trackRequestQuoteConversion(options: AdsConversionPayload = {}): boolean {
  if (requestQuoteConversionSent) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }

  ensureGtagStub();
  if (typeof window.gtag !== "function") {
    return false;
  }

  const config = getGoogleAdsConfig();
  if (!config.quoteEnabled || !config.quoteSendTo) {
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
  if (alreadyFired(dedupeKey)) {
    requestQuoteConversionSent = true;
    return true;
  }

  const allowUserData = options.includeUserData === true && pageType !== "emerge_belfast";
  if (allowUserData) {
    setEnhancedConversionUserData(options.userData);
  }

  const shared: Record<string, unknown> = {
    value: options.value,
    currency,
    transaction_id: transactionId,
  };
  if (pageType) {
    shared.page_type = pageType;
  }

  // dataLayer push for GTM (and debugging) — no PII fields.
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: ADS_EVENT_QUOTE_GENERATED,
    ...shared,
  });

  // Preferred named event.
  window.gtag("event", ADS_EVENT_QUOTE_GENERATED, {
    send_to: config.quoteSendTo,
    ...shared,
  });

  // Keep legacy request_quote listeners working without a second conversion hit.
  window.gtag("event", ADS_EVENT_REQUEST_QUOTE, {
    send_to: config.quoteSendTo,
    ...shared,
  });

  // Standard Google Ads conversion (counts once toward the Request quote action).
  window.gtag("event", "conversion", {
    send_to: config.quoteSendTo,
    ...shared,
  });

  requestQuoteConversionSent = true;
  markFired(dedupeKey);
  return true;
}

/** Allow a fresh quote interaction (e.g. “Get another quote”) to convert once. */
export function resetRequestQuoteConversion(): void {
  requestQuoteConversionSent = false;
}

/**
 * @deprecated Prefer trackRequestQuoteConversion — kept for callers during transition.
 */
export function trackRequestQuote(options: AdsConversionPayload = {}): boolean {
  return trackRequestQuoteConversion(options);
}

/**
 * Fire booking_complete only after a genuinely confirmed paid booking,
 * and only when a dedicated Booking complete conversion label exists.
 * Never falls back to the Request quote label.
 * Requires transaction_id for deduplication across refreshes.
 */
export function trackBookingComplete(options: AdsConversionPayload): boolean {
  const config = getGoogleAdsConfig();
  if (!config.bookingEnabled || !config.bookingSendTo) {
    return false;
  }
  if (config.quoteSendTo && config.bookingSendTo === config.quoteSendTo) {
    return false;
  }
  if (!hasMarketingCookieConsent()) {
    return false;
  }

  const transactionId = options.transactionId?.trim();
  if (!transactionId) {
    return false;
  }

  const dedupeKey = `${FIRED_BOOKING_PREFIX}${transactionId}`;
  if (alreadyFired(dedupeKey)) {
    return true;
  }

  const ok = fireAdsConversion({
    sendTo: config.bookingSendTo,
    eventName: ADS_EVENT_BOOKING_COMPLETE,
    value: options.value,
    currency: options.currency ?? "GBP",
    transactionId,
    userData: options.includeUserData === true ? options.userData : undefined,
  });

  if (ok) {
    markFired(dedupeKey);
  }
  return ok;
}

export function isGtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/** Test helper — current once-per-interaction latch. */
export function hasRequestQuoteConversionBeenSent(): boolean {
  return requestQuoteConversionSent;
}

/** Stable client-side quote ID for Ads deduplication when no booking reference yet. */
export function createQuoteTransactionId(prefix = "quote"): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}
