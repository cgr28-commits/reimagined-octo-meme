/**
 * Google Ads measurement (public tag ID + conversion labels).
 * Override via GitHub Actions secrets → NEXT_PUBLIC_* at build time.
 *
 * These values appear in the client bundle by design (same as Google’s tag snippet).
 * Lead/purchase Ads destinations stay disabled until distinct verified labels are set.
 */

/** My Airport Taxi NI Google Ads account tag (Request quote conversion lives here). */
export const DEFAULT_GOOGLE_ADS_ID = "AW-18303631278";

/** Request quote conversion label from Google Ads. */
export const DEFAULT_QUOTE_CONVERSION_LABEL = "_hcXCPSz7cscEK7_7JdE";

/** Paid Booking website conversion — fired only after SumUp PAID is verified. */
export const DEFAULT_PURCHASE_CONVERSION_LABEL = "GoTQCPuJ3eccEK7_7JdE";

/** Known incorrect historical values — never use even if present in env/secrets. */
const KNOWN_BAD_ADS_IDS = new Set(["AW-10303631278"]);
const KNOWN_BAD_QUOTE_LABELS = new Set(["_hcXCP5z7cscEK7_73dE"]);

export type GoogleAdsConfig = {
  adsId: string;
  /** Conversion label for successful quote / enquiry requests. */
  quoteConversionLabel: string;
  /** Optional verified label for a saved booking request (lead). */
  bookingRequestConversionLabel: string;
  /** Optional verified label for a SumUp-verified purchase. */
  purchaseConversionLabel: string;
  quoteSendTo: string;
  bookingRequestSendTo: string;
  purchaseSendTo: string;
  /** True when the Google tag ID is configured (sitewide tag can load). */
  tagEnabled: boolean;
  quoteEnabled: boolean;
  bookingRequestEnabled: boolean;
  purchaseEnabled: boolean;
};

type PublicGoogleAdsEnvName =
  | "NEXT_PUBLIC_GOOGLE_ADS_ID"
  | "NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL"
  | "NEXT_PUBLIC_GOOGLE_ADS_BOOKING_REQUEST_CONVERSION_LABEL"
  | "NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL"
  | "NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL";

/** Direct property reads are required so Next.js inlines NEXT_PUBLIC values in browser bundles. */
function env(name: PublicGoogleAdsEnvName): string {
  switch (name) {
    case "NEXT_PUBLIC_GOOGLE_ADS_ID":
      return process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() ?? "";
    case "NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL":
      return process.env.NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL?.trim() ?? "";
    case "NEXT_PUBLIC_GOOGLE_ADS_BOOKING_REQUEST_CONVERSION_LABEL":
      return process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_REQUEST_CONVERSION_LABEL?.trim() ?? "";
    case "NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL":
      return process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL?.trim() ?? "";
    case "NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL":
      return process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL?.trim() ?? "";
  }
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
 * otherwise the account defaults above are used for the tag + quote_generated.
 *
 * Never reuse the quote label for bookings — that would mix quotes with completed
 * bookings in Ads. Paid Booking has its own verified website conversion label and
 * is fired only from the server-authored SumUp PAID confirmation payload.
 */
export function getGoogleAdsConfig(): GoogleAdsConfig {
  const adsId = resolveAdsId(env("NEXT_PUBLIC_GOOGLE_ADS_ID") || DEFAULT_GOOGLE_ADS_ID);
  const quoteConversionLabel = resolveQuoteLabel(
    env("NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL") || DEFAULT_QUOTE_CONVERSION_LABEL,
  );
  let bookingRequestConversionLabel = env(
    "NEXT_PUBLIC_GOOGLE_ADS_BOOKING_REQUEST_CONVERSION_LABEL",
  );
  const purchaseConversionLabel =
    env("NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL") ||
    DEFAULT_PURCHASE_CONVERSION_LABEL;
  if (
    bookingRequestConversionLabel &&
    quoteConversionLabel &&
    bookingRequestConversionLabel === quoteConversionLabel
  ) {
    bookingRequestConversionLabel = "";
  }

  const quoteSendTo =
    adsId && quoteConversionLabel ? `${adsId}/${quoteConversionLabel}` : "";
  const bookingRequestSendTo =
    adsId && bookingRequestConversionLabel
      ? `${adsId}/${bookingRequestConversionLabel}`
      : "";
  const purchaseSendTo =
    adsId && purchaseConversionLabel ? `${adsId}/${purchaseConversionLabel}` : "";

  return {
    adsId,
    quoteConversionLabel,
    bookingRequestConversionLabel,
    purchaseConversionLabel,
    quoteSendTo,
    bookingRequestSendTo,
    purchaseSendTo,
    tagEnabled: Boolean(adsId),
    quoteEnabled: Boolean(quoteSendTo),
    // Requires its own label — tag ID alone is not enough.
    bookingRequestEnabled: Boolean(bookingRequestSendTo),
    purchaseEnabled: Boolean(purchaseSendTo),
  };
}

export const BOOKING_CONFIRMED_PATH = "/booking-confirmed/";

/** @deprecated Legacy event name retained for older imports only. */
export const ADS_EVENT_REQUEST_QUOTE = "request_quote";
/** Preferred named event for a successful priced quote (value + GBP + quote ID). */
export const ADS_EVENT_QUOTE_GENERATED = "quote_generated";
export const ADS_EVENT_BOOKING_REQUEST_SUBMITTED = "booking_request_submitted";
export const ADS_EVENT_PURCHASE = "purchase";
/** @deprecated Purchase now uses the GA4-standard event name. */
export const ADS_EVENT_BOOKING_COMPLETE = ADS_EVENT_PURCHASE;

/** Page context for Ads custom parameters (e.g. EMERGE landing). */
export type AdsQuotePageType = "main" | "emerge_belfast" | (string & {});
