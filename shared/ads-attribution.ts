import {
  sanitizeMeasurementConsent,
  type MeasurementConsent,
} from "./measurement-consent";
/** Pseudonymous advertising/campaign attribution; these identifiers are personal data. */

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
export type AttributionTouch = Partial<Record<AdsAttributionKey, string>> & {
  capturedAt: string;
  referrerHost?: string;
  source:
    | "Google Ads"
    | "Google Business Profile"
    | "Organic search"
    | "Direct / no referrer"
    | "Referral / campaign"
    | "Unknown";
  confidence: "high" | "medium" | "low" | "unknown";
  evidence: string;
};
export type AdsAttribution = Partial<Record<AdsAttributionKey, string>> & {
  consent?: MeasurementConsent;
  firstTouch?: AttributionTouch;
  lastTouch?: AttributionTouch;
};

const MAX_ATTRIBUTION_VALUE_LENGTH = 300;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;

/** Accept only known scalar fields and cap their size before storage/email use. */
export function sanitizeAdsAttribution(
  value: unknown,
): AdsAttribution | undefined {
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

  const consent = sanitizeMeasurementConsent(source.consent);
  if (consent) result.consent = consent;
  for (const key of ["firstTouch", "lastTouch"] as const) {
    const touch = sanitizeTouch(source[key]);
    if (touch) result[key] = touch;
  }
  if (result.lastTouch) {
    // Canonical current fields always come from this same touch.
    for (const key of ADS_ATTRIBUTION_KEYS) {
      delete result[key];
      if (result.lastTouch[key]) result[key] = result.lastTouch[key];
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Owner-only source summary. Raw click IDs are omitted from this display. */
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

/** Classify evidence, never infer organic/direct from missing booking attribution. */
export function makeAttributionTouch(
  params: Partial<Record<AdsAttributionKey, string>>,
  referrerHost = "",
  now = Date.now(),
): AttributionTouch {
  const source = (params.utm_source || "").toLowerCase();
  const medium = (params.utm_medium || "").toLowerCase();
  const click = Boolean(params.gclid || params.gbraid || params.wbraid);
  let label: AttributionTouch["source"] = "Unknown",
    confidence: AttributionTouch["confidence"] = "unknown",
    evidence = "Insufficient or conflicting evidence";
  if (click && (medium === "organic" || (source && source !== "google"))) {
    // Conflicting values must not become a made-up paid source.
  } else if (click) {
    label = "Google Ads";
    confidence = "high";
    evidence = "Google click identifier on this visit";
  } else if (
    source === "google" &&
    medium === "organic" &&
    params.utm_campaign === "gbp"
  ) {
    label = "Google Business Profile";
    confidence = "high";
    evidence = "Tagged Business Profile link";
  } else if (
    source === "google" &&
    ["cpc", "ppc", "paidsearch"].includes(medium)
  ) {
    label = "Google Ads";
    confidence = "medium";
    evidence = "Paid campaign tags without click identifier";
  } else if (source || medium || params.utm_campaign) {
    label = "Referral / campaign";
    confidence = "medium";
    evidence = "Campaign URL tags";
  } else if (/(^|\.)google\.(com|co\.uk|ie)$/.test(referrerHost)) {
    label = "Organic search";
    confidence = "medium";
    evidence = "Google referrer without paid evidence";
  } else if (referrerHost) {
    label = "Referral / campaign";
    confidence = "medium";
    evidence = "External referrer";
  } else {
    label = "Direct / no referrer";
    confidence = "low";
    evidence =
      "Observed entry without campaign or referrer; not proof of a typed visit";
  }
  return {
    ...params,
    capturedAt: new Date(now).toISOString(),
    ...(referrerHost ? { referrerHost } : {}),
    source: label,
    confidence,
    evidence,
  };
}
function sanitizeTouch(value: unknown): AttributionTouch | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>;
  if (
    typeof v.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(v.capturedAt))
  )
    return;
  const params: Partial<Record<AdsAttributionKey, string>> = {};
  for (const key of ADS_ATTRIBUTION_KEYS)
    if (typeof v[key] === "string")
      params[key] = (v[key] as string)
        .replace(CONTROL_CHARACTERS, " ")
        .slice(0, 300);
  const host =
    typeof v.referrerHost === "string" && /^[a-z0-9.-]+$/i.test(v.referrerHost)
      ? v.referrerHost.slice(0, 253)
      : "";
  return makeAttributionTouch(params, host, Date.parse(v.capturedAt));
}
