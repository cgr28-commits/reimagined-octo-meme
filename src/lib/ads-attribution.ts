/** Consent-gated, timestamped visits. Whole touches replace each other; fields never merge. */
import {
  ADS_ATTRIBUTION_KEYS,
  sanitizeAdsAttribution,
  makeAttributionTouch,
  type AdsAttribution,
} from "../../shared/ads-attribution";
import { CONSENT_MAX_AGE_MS } from "../../shared/measurement-consent";
import {
  hasMarketingCookieConsent,
  readMeasurementConsent,
} from "./cookie-consent";
export type AdsAttributionParams = AdsAttribution;
export const ADS_ATTRIBUTION_COOKIE = "matni-ads-attribution-v1";
const KEY = "matni-ads-attribution-v2";
let capturedThisDocument = false;
function readParams(search: string) {
  const p = new URLSearchParams(search);
  const out: Partial<Record<(typeof ADS_ATTRIBUTION_KEYS)[number], string>> =
    {};
  for (const k of ADS_ATTRIBUTION_KEYS) {
    const v = p.get(k)?.trim();
    if (v) out[k] = v.slice(0, 300);
  }
  return out;
}
// Intentionally no click-ID capture or link decoration before consent.
export function rememberLandingAdsAttribution(
  _search?: string,
): AdsAttributionParams {
  void _search;
  return {};
}
export function hrefWithPendingAdsAttribution(
  _href: string,
  _base: string,
): string | null {
  void _href;
  void _base;
  return null;
}
export function adsClickIdSearchForNavigation(_search: string): string {
  void _search;
  return "";
}
export function dropInMemoryAdsAttribution(): void {
  capturedThisDocument = false;
}
export function readStoredAdsAttribution(): AdsAttributionParams {
  if (typeof window === "undefined" || !hasMarketingCookieConsent()) return {};
  try {
    const a = sanitizeAdsAttribution(
      JSON.parse(localStorage.getItem(KEY) || "null"),
    );
    const consent = readMeasurementConsent();
    if (
      !a?.consent ||
      a.consent.id !== consent?.id ||
      !a.lastTouch ||
      Date.now() - Date.parse(a.lastTouch.capturedAt) > CONSENT_MAX_AGE_MS
    )
      return {};
    return a;
  } catch {
    return {};
  }
}
function referrerHost(): string {
  try {
    const host = new URL(document.referrer).hostname;
    return host === window.location.hostname ? "" : host;
  } catch {
    return "";
  }
}
function ownReferrer(): boolean {
  try {
    return new URL(document.referrer).hostname === window.location.hostname;
  } catch {
    return false;
  }
}
export function captureAdsAttributionFromLocation(
  search = typeof window !== "undefined" ? window.location.search : "",
): AdsAttributionParams {
  if (typeof window === "undefined" || !hasMarketingCookieConsent()) return {};
  const existing = readStoredAdsAttribution();
  if (capturedThisDocument) return existing;
  capturedThisDocument = true;
  // Payment returns and internal navigation are not new acquisition visits.
  if (
    ownReferrer() ||
    /\/(booking-confirmed|pay|book-quote)(\/|$)/.test(window.location.pathname)
  )
    return existing;
  const touch = makeAttributionTouch(readParams(search), referrerHost());
  const first =
    existing.firstTouch &&
    Date.now() - Date.parse(existing.firstTouch.capturedAt) <=
      CONSENT_MAX_AGE_MS
      ? existing.firstTouch
      : touch;
  const next: AdsAttribution = {
    ...readParams(search),
    consent: readMeasurementConsent(),
    firstTouch: first,
    lastTouch: touch,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* memory-free failure is Unknown */
  }
  return next;
}
export function clearStoredAdsAttribution(): void {
  capturedThisDocument = false;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(ADS_ATTRIBUTION_COOKIE);
  } catch {
    /* unavailable */
  }
  if (typeof document !== "undefined")
    document.cookie = `${ADS_ATTRIBUTION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
export function readConsentedAdsAttribution():
  AdsAttributionParams | undefined {
  const a = readStoredAdsAttribution();
  return a.lastTouch ? a : undefined;
}
export function bookingWithConsentedAdsAttribution<
  T extends { attribution?: AdsAttribution },
>(booking: T): T {
  const attribution = readConsentedAdsAttribution();
  const next = { ...booking };
  if (attribution) next.attribution = attribution;
  else delete next.attribution;
  return next;
}
