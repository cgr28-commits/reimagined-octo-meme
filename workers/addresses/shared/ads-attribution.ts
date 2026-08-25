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
