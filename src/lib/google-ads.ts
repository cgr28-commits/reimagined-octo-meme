/**
 * Google Ads measurement (public tag ID + conversion labels).
 * Override via GitHub Actions secrets → NEXT_PUBLIC_* at build time.
 *
 * These values appear in the client bundle by design (same as Google’s tag snippet).
 * Booking complete stays disabled until GOOGLE_ADS_BOOKING_CONVERSION_LABEL is set.
 */

/** My Airport Taxi NI Google Ads account tag (Request quote conversion lives here). */
export const DEFAULT_GOOGLE_ADS_ID = "AW-18303631278";

/** Request quote conversion label from Google Ads. */
export const DEFAULT_QUOTE_CONVERSION_LABEL = "_hcXCPSz7cscEK7_7JdE";

/** Known incorrect historical values — never use even if present in env/secrets. */
const KNOWN_BAD_ADS_IDS = new Set(["AW-10303631278"]);
const KNOWN_BAD_QUOTE_LABELS = new Set(["_hcXCP5z7cscEK7_73dE"]);

export type GoogleAdsConfig = {
  adsId: string;
  /** Conversion label for successful quote / enquiry requests. */
  quoteConversionLabel: string;
  /** Conversion label for confirmed paid bookings (empty until created in Ads). */
  bookingConversionLabel: string;
  quoteSendTo: string;
  bookingSendTo: string;
  /** True when the Google tag ID is configured (sitewide tag can load). */
  tagEnabled: boolean;
  quoteEnabled: boolean;
  bookingEnabled: boolean;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function resolveAdsId(raw: string): string {
  if (!raw || KNOWN_BAD_ADS_IDS.has(raw)) {
    return DEFAULT_GOOGLE_ADS_ID;
  }
  return raw;
}

function resolveQuoteLabel(raw: string): string {
  if (!raw || KNOWN_BAD_QUOTE_LABELS.has(raw)) {
    return DEFAULT_QUOTE_CONVERSION_LABEL;
  }
  return raw;
}

/**
 * Reads Ads config. Env/secrets win unless they contain known-bad typo values;
 * otherwise the account defaults above are used for the tag + request_quote.
 *
 * Important: the account currently has Calls + Request quote only. Never reuse the
 * quote label for bookings — that would mix quotes with completed bookings in Ads.
 * booking_complete stays fully disabled until a distinct booking label is set.
 */
export function getGoogleAdsConfig(): GoogleAdsConfig {
  const adsId = resolveAdsId(env("NEXT_PUBLIC_GOOGLE_ADS_ID") || DEFAULT_GOOGLE_ADS_ID);
  const quoteConversionLabel = resolveQuoteLabel(
    env("NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL") || DEFAULT_QUOTE_CONVERSION_LABEL,
  );
  // Distinct booking label only — no legacy fallback, no quote-label reuse.
  let bookingConversionLabel = env("NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL");
  if (
    bookingConversionLabel &&
    quoteConversionLabel &&
    bookingConversionLabel === quoteConversionLabel
  ) {
    bookingConversionLabel = "";
  }

  const quoteSendTo =
    adsId && quoteConversionLabel ? `${adsId}/${quoteConversionLabel}` : "";
  const bookingSendTo =
    adsId && bookingConversionLabel ? `${adsId}/${bookingConversionLabel}` : "";

  return {
    adsId,
    quoteConversionLabel,
    bookingConversionLabel,
    quoteSendTo,
    bookingSendTo,
    tagEnabled: Boolean(adsId),
    quoteEnabled: Boolean(quoteSendTo),
    // Requires its own label — tag ID alone is not enough.
    bookingEnabled: Boolean(bookingSendTo),
  };
}

export const BOOKING_CONFIRMED_PATH = "/booking-confirmed/";

/** Legacy / Ads named event for successful priced quote requests. */
export const ADS_EVENT_REQUEST_QUOTE = "request_quote";
/** Preferred named event for a successful priced quote (value + GBP + quote ID). */
export const ADS_EVENT_QUOTE_GENERATED = "quote_generated";
export const ADS_EVENT_BOOKING_COMPLETE = "booking_complete";

/** Page context for Ads custom parameters (e.g. EMERGE landing). */
export type AdsQuotePageType = "main" | "emerge_belfast" | (string & {});

