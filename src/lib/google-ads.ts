/**
 * Google Ads measurement (public tag ID + conversion labels).
 * Override via GitHub Actions secrets → NEXT_PUBLIC_* at build time.
 *
 * These values appear in the client bundle by design (same as Google’s tag snippet).
 * Booking complete stays disabled until GOOGLE_ADS_BOOKING_CONVERSION_LABEL is set.
 */

/** My Airport Taxi NI Google Ads account tag. */
const DEFAULT_GOOGLE_ADS_ID = "AW-10303631278";

/** Request quote conversion label from Google Ads. */
const DEFAULT_QUOTE_CONVERSION_LABEL = "_hcXCP5z7cscEK7_73dE";

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

/**
 * Reads Ads config. Env/secrets win; otherwise the account defaults above are used
 * for the tag + request_quote. booking_complete send_to stays off until a booking label is provided.
 */
export function getGoogleAdsConfig(): GoogleAdsConfig {
  const adsId = env("NEXT_PUBLIC_GOOGLE_ADS_ID") || DEFAULT_GOOGLE_ADS_ID;
  const quoteConversionLabel =
    env("NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL") || DEFAULT_QUOTE_CONVERSION_LABEL;
  // Do not fall back to the legacy single conversion label — that would invent a booking conversion.
  const bookingConversionLabel = env("NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL");

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
    bookingEnabled: Boolean(bookingSendTo),
  };
}

export const BOOKING_CONFIRMED_PATH = "/booking-confirmed/";

export const ADS_EVENT_REQUEST_QUOTE = "request_quote";
export const ADS_EVENT_BOOKING_COMPLETE = "booking_complete";
