/**
 * Consented Google Ads attribution stored with a Saved Quote, restored at pay
 * only when the current booking has no eligible click ID and consent still allows it.
 */

import {
  cameFromGoogleAd,
  sanitizeAdsAttribution,
  type AdsAttribution,
} from "./ads-attribution";
import { pickAdsClickIdentifier } from "./google-ads-click-conversions";

export type MeasurementConsentState = "accepted" | "rejected" | "unanswered";

export type SavedQuoteAttributionConsent = "accepted";

export function parseMeasurementConsent(value: unknown): MeasurementConsentState {
  if (value === "accepted" || value === "rejected") return value;
  return "unanswered";
}

function clickIdsOnly(attribution: AdsAttribution | undefined): AdsAttribution {
  if (!attribution) return {};
  const out: AdsAttribution = {};
  if (attribution.gclid) out.gclid = attribution.gclid;
  if (attribution.wbraid) out.wbraid = attribution.wbraid;
  if (attribution.gbraid) out.gbraid = attribution.gbraid;
  return out;
}

function withoutClickIds(attribution: AdsAttribution | undefined): AdsAttribution {
  if (!attribution) return {};
  const { gclid: _g, wbraid: _w, gbraid: _b, ...rest } = attribution;
  return rest;
}

/**
 * What may be persisted on SavedQuoteRecord.
 * Click IDs only when measurement consent is accepted; otherwise at most ad_click.
 */
export function attributionForSavedQuoteStorage(input: {
  attribution?: unknown;
  measurementConsent?: MeasurementConsentState | null;
}): {
  attribution?: AdsAttribution;
  attributionConsent?: SavedQuoteAttributionConsent;
} {
  const consent = parseMeasurementConsent(input.measurementConsent);
  const sanitized = sanitizeAdsAttribution(input.attribution);
  const fromAd = cameFromGoogleAd(sanitized) || Boolean(pickAdsClickIdentifier(sanitized));

  if (consent === "accepted") {
    if (!sanitized) {
      return fromAd ? { attribution: { ad_click: "google" }, attributionConsent: "accepted" } : {};
    }
    const withMarker =
      fromAd || sanitized.ad_click === "google"
        ? { ...sanitized, ad_click: "google" as const }
        : sanitized;
    return {
      attribution: withMarker,
      attributionConsent: "accepted",
    };
  }

  // Rejected or unanswered: never store a click ID. Keep a yes/no ad marker only.
  if (fromAd || sanitized?.ad_click === "google") {
    return { attribution: { ad_click: "google" } };
  }
  return {};
}

/**
 * Merge saved-quote attribution into a payment booking.
 * Existing eligible booking click IDs always win. Known consent withdrawal blocks restore.
 */
export function mergeSavedQuoteAttributionForPayment(input: {
  bookingAttribution?: unknown;
  savedAttribution?: AdsAttribution | null | undefined;
  savedAttributionConsent?: SavedQuoteAttributionConsent | null | undefined;
  measurementConsent?: MeasurementConsentState | null;
}): AdsAttribution | undefined {
  const booking = sanitizeAdsAttribution(input.bookingAttribution);
  if (pickAdsClickIdentifier(booking)) {
    return booking;
  }

  const consent = parseMeasurementConsent(input.measurementConsent);

  // Known withdrawal: never restore saved attribution (including ad_click).
  if (consent === "rejected") {
    return booking;
  }

  const saved = sanitizeAdsAttribution(input.savedAttribution);
  const canRestoreClickIds =
    consent === "accepted" && input.savedAttributionConsent === "accepted";

  if (canRestoreClickIds && pickAdsClickIdentifier(saved)) {
    // Booking may hold UTMs / markers from this visit; click IDs come from the save.
    const merged = sanitizeAdsAttribution({
      ...withoutClickIds(booking),
      ...saved,
      ...clickIdsOnly(saved),
      ...(cameFromGoogleAd(saved) || booking?.ad_click === "google" || saved?.ad_click === "google"
        ? { ad_click: "google" as const }
        : {}),
    });
    return merged;
  }

  if (booking) return booking;

  // No booking attribution: optional non-identifying ad marker only (never click IDs).
  if (saved?.ad_click === "google" || pickAdsClickIdentifier(saved) || cameFromGoogleAd(saved)) {
    return { ad_click: "google" };
  }

  return undefined;
}
