/**
 * Preserve Google Ads / campaign attribution across the quote and booking journey.
 * Captures utm_* and gclid on first landing; re-appends when building internal URLs.
 */

const ATTR_STORAGE_KEY = "matni-ads-attribution-v1";

const ATTR_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
] as const;

export type AdsAttributionParams = Partial<Record<(typeof ATTR_PARAM_KEYS)[number], string>>;

function readSearchParams(search: string): AdsAttributionParams {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: AdsAttributionParams = {};
  for (const key of ATTR_PARAM_KEYS) {
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
    const merged = { ...readStoredAdsAttribution(), ...fromUrl };
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
    const parsed = JSON.parse(raw) as AdsAttributionParams;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Append stored UTM / gclid params to a path or absolute URL (no PII). */
export function withAdsAttribution(pathOrUrl: string): string {
  const attrs = readStoredAdsAttribution();
  const keys = Object.keys(attrs) as Array<keyof AdsAttributionParams>;
  if (keys.length === 0) {
    return pathOrUrl;
  }

  try {
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    const url = isAbsolute
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl, "https://www.myairporttaxini.co.uk");
    for (const key of keys) {
      const value = attrs[key];
      if (value && !url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    }
    if (isAbsolute) {
      return url.toString();
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return pathOrUrl;
  }
}
