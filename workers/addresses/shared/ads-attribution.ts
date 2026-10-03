/** Safe, non-PII advertising/campaign attribution stored with a booking. */

export const ADS_ATTRIBUTION_KEYS = [
  "gclid",
  "gbraid",
  "wbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type AdsAttributionKey = (typeof ADS_ATTRIBUTION_KEYS)[number];
export type AdsAttribution = Partial<Record<AdsAttributionKey, string>>;

export const ADS_MEASUREMENT_CONSENTS = ["accepted", "rejected", "unanswered"] as const;
export type AdsMeasurementConsent = (typeof ADS_MEASUREMENT_CONSENTS)[number];

export const ADS_ATTRIBUTION_OUTCOMES = [
  "click_id_captured",
  "consent_rejected",
  "consent_unanswered",
  "no_click_id",
] as const;
export type AdsAttributionOutcome = (typeof ADS_ATTRIBUTION_OUTCOMES)[number];

/** Why a booking does or does not have a Google Ads click ID. Never contains the ID. */
export type AdsMeasurementRecord = {
  consent: AdsMeasurementConsent;
  outcome: AdsAttributionOutcome;
  clickIdObserved: boolean;
};

const MAX_ATTRIBUTION_VALUE_LENGTH = 300;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;

/** Accept only known scalar fields and cap their size before storage/email use. */
export function sanitizeAdsAttribution(value: unknown): AdsAttribution | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const result: AdsAttribution = {};
  for (const key of ADS_ATTRIBUTION_KEYS) {
    const raw = source[key];
    if (typeof raw !== "string") continue;
    const cleaned = raw
      .replace(CONTROL_CHARACTERS, " ")
      .trim()
      .slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
    if (cleaned) result[key] = cleaned;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizeAdsMeasurement(value: unknown): AdsMeasurementRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const consent = source.consent;
  const outcome = source.outcome;
  if (
    consent !== "accepted" &&
    consent !== "rejected" &&
    consent !== "unanswered"
  ) {
    return undefined;
  }
  if (
    outcome !== "click_id_captured" &&
    outcome !== "consent_rejected" &&
    outcome !== "consent_unanswered" &&
    outcome !== "no_click_id"
  ) {
    return undefined;
  }
  return {
    consent,
    outcome,
    clickIdObserved: source.clickIdObserved === true,
  };
}

function hasAdsClickId(attribution: AdsAttribution | undefined): boolean {
  return Boolean(attribution?.gclid || attribution?.wbraid || attribution?.gbraid);
}

/**
 * Store a click ID only after measurement consent. Derive the outcome from
 * that consent. When the client sends no consent record, leave the booking
 * unchanged so an older row is not given a guessed reason.
 */
export function applyAdsMeasurementToBooking<
  T extends { attribution?: AdsAttribution; adsMeasurement?: AdsMeasurementRecord },
>(booking: T): T {
  const measurement = sanitizeAdsMeasurement(booking.adsMeasurement);
  const attribution = sanitizeAdsAttribution(booking.attribution);
  if (!measurement) {
    const next = { ...booking };
    if (attribution) next.attribution = attribution;
    else delete next.attribution;
    delete next.adsMeasurement;
    return next;
  }

  if (measurement.consent !== "accepted") {
    const next = {
      ...booking,
      adsMeasurement: {
        consent: measurement.consent,
        outcome:
          measurement.consent === "rejected"
            ? ("consent_rejected" as const)
            : ("consent_unanswered" as const),
        clickIdObserved: measurement.clickIdObserved === true,
      },
    };
    delete next.attribution;
    return next;
  }

  const next = {
    ...booking,
    adsMeasurement: {
      consent: "accepted" as const,
      outcome: hasAdsClickId(attribution)
        ? ("click_id_captured" as const)
        : ("no_click_id" as const),
      clickIdObserved: hasAdsClickId(attribution) || measurement.clickIdObserved === true,
    },
  };
  if (attribution) next.attribution = attribution;
  else delete next.attribution;
  return next;
}

/** Owner-only, non-sensitive source summary. Raw click IDs remain in the booking record. */
export function formatAdsAttributionForOwner(value: unknown): string[] {
  const attribution = sanitizeAdsAttribution(value);
  if (!attribution) return [];

  const labels: Array<[AdsAttributionKey, string]> = [
    ["utm_source", "Source"],
    ["utm_medium", "Medium"],
    ["utm_campaign", "Campaign"],
    ["utm_term", "Term"],
    ["utm_content", "Content"],
  ];
  const lines = labels.flatMap(([key, label]) =>
    attribution[key] ? [`${label}: ${attribution[key]}`] : [],
  );
  const clickIds = (["gclid", "gbraid", "wbraid"] as const).filter(
    (key) => attribution[key],
  );
  if (clickIds.length > 0) {
    lines.push(`Google Ads click identifier captured: ${clickIds.join(", ")}`);
  }
  return lines;
}
