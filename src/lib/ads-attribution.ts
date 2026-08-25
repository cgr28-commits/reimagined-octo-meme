/** Preserve consented Google Ads / campaign attribution across a booking journey. */

import {
  ADS_ATTRIBUTION_KEYS,
  sanitizeAdsAttribution,
  type AdsAttribution,
} from "../../shared/ads-attribution";
import { hasMarketingCookieConsent } from "@/lib/cookie-consent";

const ATTR_STORAGE_KEY = "matni-ads-attribution-v1";

export type AdsAttributionParams = AdsAttribution;

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

export function captureAdsAttributionFromLocation(
  search = typeof window !== "undefined" ? window.location.search : "",
): AdsAttributionParams {
  if (typeof window === "undefined") {
    return {};
  }
  const fromUrl = readSearchParams(search);
  if (Object.keys(fromUrl).length === 0) {
    return readStoredAdsAttribution();
  }
  try {
    const merged = sanitizeAdsAttribution({ ...readStoredAdsAttribution(), ...fromUrl }) ?? {};
    window.sessionStorage.setItem(ATTR_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return fromUrl;
  }
}

export function readStoredAdsAttribution(): AdsAttributionParams {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(ATTR_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeAdsAttribution(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

/** Attribution may be sent to the Worker only after measurement consent. */
export function readConsentedAdsAttribution(): AdsAttributionParams | undefined {
  if (!hasMarketingCookieConsent()) return undefined;
  return sanitizeAdsAttribution(readStoredAdsAttribution());
}
