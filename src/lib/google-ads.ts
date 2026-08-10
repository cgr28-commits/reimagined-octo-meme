/** Optional Google Ads measurement (set via GitHub Actions secrets → NEXT_PUBLIC_*). */

export type GoogleAdsConfig = {
  adsId: string;
  /** Conversion label for successful quote / enquiry requests. */
  quoteConversionLabel: string;
  /** Conversion label for confirmed paid bookings. */
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
 * Reads public Ads config baked in at build time.
 * Booking label falls back to the legacy GOOGLE_ADS_CONVERSION_LABEL secret.
 */
export function getGoogleAdsConfig(): GoogleAdsConfig {
  const adsId = env("NEXT_PUBLIC_GOOGLE_ADS_ID");
  const quoteConversionLabel = env("NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL");
  const bookingConversionLabel =
    env("NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL") ||
    env("NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL");

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
