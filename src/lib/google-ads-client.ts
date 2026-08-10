/**
 * Browser-side Google Ads / Consent Mode helpers.
 * Safe to import from client components (guards on window).
 */

import {
  ADS_EVENT_BOOKING_COMPLETE,
  ADS_EVENT_REQUEST_QUOTE,
  getGoogleAdsConfig,
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

export type AdsUserData = {
  email?: string;
  phone?: string;
};

export type AdsConversionPayload = {
  value?: number;
  currency?: string;
  transactionId?: string;
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

  // Named event for Ads/GA4 conversion configuration (request_quote / booking_complete).
  window.gtag("event", options.eventName, { ...shared });

  // Standard Google Ads conversion hit when a conversion label is configured.
  if (options.sendTo) {
    window.gtag("event", "conversion", {
      ...shared,
      send_to: options.sendTo,
    });
  }

  return true;
}

/**
 * Fire request_quote after a successful quote/enquiry submission.
 * Uses transaction_id (booking reference) so refreshes do not double-count.
 */
export function trackRequestQuote(options: AdsConversionPayload = {}): boolean {
  const config = getGoogleAdsConfig();
  if (!config.tagEnabled && !config.quoteEnabled) {
    return false;
  }
  if (!hasMarketingCookieConsent()) {
    return false;
  }

  const transactionId = options.transactionId?.trim();
  const dedupeKey = `${FIRED_QUOTE_PREFIX}${transactionId || "anonymous"}`;
  if (transactionId && alreadyFired(dedupeKey)) {
    return true;
  }

  const ok = fireAdsConversion({
    sendTo: config.quoteSendTo,
    eventName: ADS_EVENT_REQUEST_QUOTE,
    value: options.value,
    currency: options.currency ?? "GBP",
    transactionId,
    userData: options.userData,
  });

  if (ok && transactionId) {
    markFired(dedupeKey);
  }
  return ok;
}

/**
 * Fire booking_complete only after a genuinely confirmed paid booking.
 * Requires transaction_id for deduplication across refreshes.
 */
export function trackBookingComplete(options: AdsConversionPayload): boolean {
  const config = getGoogleAdsConfig();
  if (!config.tagEnabled && !config.bookingEnabled) {
    return false;
  }
  if (!hasMarketingCookieConsent()) {
    return false;
  }

  const transactionId = options.transactionId?.trim();
  if (!transactionId) {
    // Without a unique ID, a refresh can double-count — skip Ads conversion.
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
    userData: options.userData,
  });

  if (ok) {
    markFired(dedupeKey);
  }
  return ok;
}

export function isGtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}
