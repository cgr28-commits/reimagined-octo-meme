/** Preserve consented Google Ads / campaign attribution across a booking journey. */

import {
  ADS_ATTRIBUTION_KEYS,
  sanitizeAdsAttribution,
  type AdsAttribution,
} from "../../shared/ads-attribution";
import { hasMarketingCookieConsent, readCookieConsent } from "@/lib/cookie-consent";

const ATTR_STORAGE_KEY = "matni-ads-attribution-v1";
/** First-party cookie. Written only after measurement consent is accepted. */
export const ADS_ATTRIBUTION_COOKIE = "matni-ads-attribution-v1";
const ADS_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type AdsAttributionParams = AdsAttribution;

type LandingWindow = Window & { __matniLandingSearch?: string };

/** In-memory landing click IDs. Not storage, and cleared when consent is rejected. */
let pendingLanding: AdsAttributionParams = {};

function readSearchParams(search: string): AdsAttributionParams {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: AdsAttributionParams = {};
  for (const key of ADS_ATTRIBUTION_KEYS) {
    const value = params.get(key)?.trim();
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

function landingSearchMarkedOnWindow(): string {
  if (typeof window === "undefined") return "";
  const marked = (window as LandingWindow).__matniLandingSearch;
  return typeof marked === "string" ? marked : "";
}

function mergeAttribution(...parts: Array<AdsAttribution | undefined>): AdsAttributionParams {
  return sanitizeAdsAttribution(Object.assign({}, ...parts)) ?? {};
}

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

function readCookieAttribution(): AdsAttributionParams {
  const raw = readCookieValue(ADS_ATTRIBUTION_COOKIE);
  if (!raw) return {};
  try {
    return sanitizeAdsAttribution(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

function writeAttributionCookie(value: AdsAttributionParams): void {
  if (typeof document === "undefined" || !hasMarketingCookieConsent()) return;
  const secure =
    typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ADS_ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=${ADS_ATTRIBUTION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function clearAttributionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ADS_ATTRIBUTION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Hold click IDs from the landing URL in memory only.
 * Call this before consent. It does not write sessionStorage or a cookie.
 */
export function rememberLandingAdsAttribution(search?: string): AdsAttributionParams {
  if (typeof window === "undefined") return {};
  const fromArg = search ?? window.location.search;
  pendingLanding = mergeAttribution(
    pendingLanding,
    readSearchParams(landingSearchMarkedOnWindow()),
    readSearchParams(fromArg),
  );
  return pendingLanding;
}

/** A new document drops this naturally. Tests use it to simulate a later visit. */
export function dropInMemoryAdsAttribution(): void {
  pendingLanding = {};
}

/**
 * While consent is still undecided, keep the landing click ID on same-site links.
 * A full page load would otherwise drop it before the visitor chooses.
 * Returns null when the link should stay unchanged.
 */
export function hrefWithPendingAdsAttribution(href: string, baseHref: string): string | null {
  if (readCookieConsent() !== null) return null;
  if (!href || href.startsWith("#") || /^(?:mailto:|tel:|sms:)/i.test(href)) return null;
  let url: URL;
  let base: URL;
  try {
    base = new URL(baseHref);
    url = new URL(href, baseHref);
  } catch {
    return null;
  }
  if (url.origin !== base.origin) return null;
  const landing = mergeAttribution(
    pendingLanding,
    readSearchParams(landingSearchMarkedOnWindow()),
    readSearchParams(base.search),
  );
  let changed = false;
  for (const key of ADS_ATTRIBUTION_KEYS) {
    const value = landing[key];
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
      changed = true;
    }
  }
  if (!changed) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Query string for a full page load while a click ID must survive navigation.
 * Empty after a reject, so a rejected click ID is not copied onto the next URL.
 */
export function adsClickIdSearchForNavigation(currentSearch: string): string {
  if (typeof window === "undefined" || readCookieConsent() === "rejected") return "";
  const landing = mergeAttribution(
    pendingLanding,
    readSearchParams(landingSearchMarkedOnWindow()),
    readSearchParams(currentSearch),
    hasMarketingCookieConsent() ? readCookieAttribution() : undefined,
    hasMarketingCookieConsent() ? readStoredAdsAttribution() : undefined,
  );
  const params = new URLSearchParams();
  for (const key of ADS_ATTRIBUTION_KEYS) {
    const value = landing[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function readStoredAdsAttribution(): AdsAttributionParams {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(ATTR_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeAdsAttribution(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

function consentedAttribution(search = ""): AdsAttributionParams {
  return mergeAttribution(
    readCookieAttribution(),
    readStoredAdsAttribution(),
    pendingLanding,
    readSearchParams(landingSearchMarkedOnWindow()),
    readSearchParams(search),
  );
}

/**
 * After measurement consent, persist the landing click ID for this tab and
 * for a later visit in the same browser. Without consent, only the in-memory
 * landing copy is updated.
 */
export function captureAdsAttributionFromLocation(
  search = typeof window !== "undefined" ? window.location.search : "",
): AdsAttributionParams {
  if (typeof window === "undefined") return {};
  rememberLandingAdsAttribution(search);
  if (!hasMarketingCookieConsent()) return {};
  const merged = consentedAttribution(search);
  try {
    if (Object.keys(merged).length > 0) {
      window.sessionStorage.setItem(ATTR_STORAGE_KEY, JSON.stringify(merged));
    } else {
      window.sessionStorage.removeItem(ATTR_STORAGE_KEY);
    }
  } catch {
    // sessionStorage can throw in private mode; the cookie still carries it.
  }
  if (Object.keys(merged).length > 0) writeAttributionCookie(merged);
  else clearAttributionCookie();
  return merged;
}

/** Remove every stored click ID. Used when the visitor rejects measurement cookies. */
export function clearStoredAdsAttribution(): void {
  pendingLanding = {};
  if (typeof window !== "undefined") {
    try {
      (window as LandingWindow).__matniLandingSearch = "";
    } catch {
      // Ignore.
    }
    try {
      window.sessionStorage.removeItem(ATTR_STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }
  clearAttributionCookie();
}

/** Attribution may be sent to the Worker only after measurement consent. */
export function readConsentedAdsAttribution(): AdsAttributionParams | undefined {
  if (typeof window === "undefined" || !hasMarketingCookieConsent()) return undefined;
  const merged = consentedAttribution();
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Attach the consented click ID, or remove one that was captured before a reject.
 */
export function bookingWithConsentedAdsAttribution<T extends { attribution?: AdsAttribution }>(
  booking: T,
): T {
  const attribution = readConsentedAdsAttribution();
  if (!attribution) {
    if (!Object.prototype.hasOwnProperty.call(booking, "attribution")) return booking;
    const next = { ...booking };
    delete next.attribution;
    return next;
  }
  return { ...booking, attribution };
}
