/**
 * Internal Google Ads suspicious-traffic monitoring (evidence only — no blocking).
 * Complements TrafficGuard; does not replace Ads attribution or Google Ads conversions.
 */

import {
  ADS_ATTRIBUTION_KEYS,
  sanitizeAdsAttribution,
  type AdsAttribution,
} from "./ads-attribution";

/** Detailed event retention in KV. */
export const AD_FRAUD_EVENT_TTL_SECONDS = 60 * 60 * 24 * 90;
/** Visitor aggregate retention (aligned with event window). */
export const AD_FRAUD_VISITOR_TTL_SECONDS = AD_FRAUD_EVENT_TTL_SECONDS;
/** Max events accepted per IP hash per hour. */
export const AD_FRAUD_INGEST_RATE_LIMIT = 60;
/** Max chronological events kept on a visitor aggregate. */
export const AD_FRAUD_VISITOR_EVENT_CAP = 80;
/** Max visitor hashes indexed per UTC day. */
export const AD_FRAUD_DAY_INDEX_CAP = 2000;

export const AD_FRAUD_EVENT_TYPES = [
  "paid_visit",
  "quote_started",
  "quote_completed",
  "booking_started",
  "booking_completed",
  "payment_started",
  "payment_completed",
  "whatsapp_clicked",
  "phone_clicked",
] as const;

export type AdFraudEventType = (typeof AD_FRAUD_EVENT_TYPES)[number];

export const AD_FRAUD_RISK_LEVELS = ["normal", "low", "medium", "high"] as const;
export type AdFraudRiskLevel = (typeof AD_FRAUD_RISK_LEVELS)[number];

export const AD_FRAUD_REVIEW_STATUSES = [
  "unreviewed",
  "reviewed",
  "false_positive",
  "suspicious",
  "exclusion_candidate",
] as const;
export type AdFraudReviewStatus = (typeof AD_FRAUD_REVIEW_STATUSES)[number];

export const MEANINGFUL_ENGAGEMENT_EVENTS: ReadonlySet<AdFraudEventType> = new Set([
  "quote_started",
  "quote_completed",
  "booking_started",
  "booking_completed",
  "payment_started",
  "payment_completed",
  "whatsapp_clicked",
  "phone_clicked",
]);

export const QUOTE_ACTIVITY_EVENTS: ReadonlySet<AdFraudEventType> = new Set([
  "quote_started",
  "quote_completed",
]);

export type AdFraudEventRecord = {
  id: string;
  timestamp: string;
  eventType: AdFraudEventType;
  visitorHash: string;
  /** Server-side salted hash of CF-Connecting-IP — never raw IP. */
  ipHash?: string;
  sessionId?: string;
  userAgentNorm?: string;
  landingPath?: string;
  referrerHost?: string;
  attribution?: AdsAttribution;
  /** Truncated/hashed click id for correlation — not shown as raw secret. */
  clickIdHint?: string;
  meta?: Record<string, string>;
};

export type AdFraudVisitorRecord = {
  visitorHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  paidVisitCount: number;
  quoteStartedCount: number;
  quoteCompletedCount: number;
  bookingStartedCount: number;
  bookingCompletedCount: number;
  paymentStartedCount: number;
  paymentCompletedCount: number;
  whatsappClickCount: number;
  phoneClickCount: number;
  landingPaths: string[];
  campaigns: string[];
  events: AdFraudEventRecord[];
  score: number;
  risk: AdFraudRiskLevel;
  reasons: string[];
  reviewStatus: AdFraudReviewStatus;
  notes?: string;
  reviewedAt?: string;
};

export type AdFraudIngestPayload = {
  eventType: unknown;
  sessionId?: unknown;
  landingPath?: unknown;
  referrer?: unknown;
  userAgent?: unknown;
  attribution?: unknown;
  meta?: unknown;
  /** Client-supplied visitor id is ignored — server derives hashes. */
  visitorHash?: unknown;
  ip?: unknown;
};

export type AdFraudScoreInput = {
  paidVisits24h: number;
  paidVisits7d: number;
  hasQuoteActivity: boolean;
  hasMeaningfulEngagement: boolean;
};

export type AdFraudScoreResult = {
  score: number;
  risk: AdFraudRiskLevel;
  reasons: string[];
};

const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;

export function isAdFraudEventType(value: unknown): value is AdFraudEventType {
  return typeof value === "string" && (AD_FRAUD_EVENT_TYPES as readonly string[]).includes(value);
}

export function isAdFraudRiskLevel(value: unknown): value is AdFraudRiskLevel {
  return typeof value === "string" && (AD_FRAUD_RISK_LEVELS as readonly string[]).includes(value);
}

export function isAdFraudReviewStatus(value: unknown): value is AdFraudReviewStatus {
  return typeof value === "string" && (AD_FRAUD_REVIEW_STATUSES as readonly string[]).includes(value);
}

export function normalizeUserAgent(ua: string | null | undefined): string | undefined {
  if (!ua || typeof ua !== "string") return undefined;
  const cleaned = ua.replace(CONTROL_CHARS, " ").trim().slice(0, 180);
  if (!cleaned) return undefined;
  // Coarse device/browser bucket — not a fingerprint.
  const lower = cleaned.toLowerCase();
  const browser = lower.includes("edg/")
    ? "Edge"
    : lower.includes("chrome/")
      ? "Chrome"
      : lower.includes("safari/") && !lower.includes("chrome")
        ? "Safari"
        : lower.includes("firefox/")
          ? "Firefox"
          : "Other";
  const os = lower.includes("android")
    ? "Android"
    : lower.includes("iphone") || lower.includes("ipad")
      ? "iOS"
      : lower.includes("mac os")
        ? "macOS"
        : lower.includes("windows")
          ? "Windows"
          : "Other";
  return `${browser}/${os}`;
}

export function normalizeLandingPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(CONTROL_CHARS, "").trim().slice(0, 200);
  if (!cleaned.startsWith("/")) return undefined;
  return cleaned.split("?")[0]?.split("#")[0] || undefined;
}

export function normalizeReferrerHost(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const host = new URL(value).hostname.toLowerCase().slice(0, 120);
    return host || undefined;
  } catch {
    return undefined;
  }
}

export function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned.length >= 8 ? cleaned : undefined;
}

export function sanitizeAdFraudMeta(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string") continue;
    const k = key.replace(CONTROL_CHARS, "").trim().slice(0, 40);
    const v = raw.replace(CONTROL_CHARS, " ").trim().slice(0, 120);
    if (!k || !v) continue;
    out[k] = v;
    if (Object.keys(out).length >= 8) break;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** True when URL/query attribution indicates a paid-ad arrival. */
export function isPaidAdAttribution(attribution: AdsAttribution | undefined): boolean {
  if (!attribution) return false;
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) return true;
  const medium = (attribution.utm_medium ?? "").toLowerCase();
  if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "paidsearch") {
    return true;
  }
  const source = (attribution.utm_source ?? "").toLowerCase();
  if (source === "google" && medium.includes("paid")) return true;
  if (attribution.utm_campaign || attribution.utm_term || attribution.utm_content) {
    // UTM without click id — still treat as campaign traffic for monitoring.
    return Boolean(attribution.utm_source || attribution.utm_medium || attribution.utm_campaign);
  }
  return false;
}

export function attributionFromSearchParams(
  params: URLSearchParams | Record<string, string>,
): AdsAttribution | undefined {
  const raw: Record<string, string> = {};
  if (params instanceof URLSearchParams) {
    for (const key of ADS_ATTRIBUTION_KEYS) {
      const value = params.get(key);
      if (value) raw[key] = value;
    }
  } else {
    for (const key of ADS_ATTRIBUTION_KEYS) {
      if (params[key]) raw[key] = params[key];
    }
  }
  return sanitizeAdsAttribution(raw);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Irreversible visitor identifier for admin display. */
export async function hashAdFraudVisitorId(input: {
  salt: string;
  sessionId?: string;
  ipHash?: string;
  userAgentNorm?: string;
}): Promise<string> {
  const salt = input.salt.trim();
  const material = [
    salt,
    input.sessionId?.trim() || "",
    input.ipHash?.trim() || "",
    input.userAgentNorm?.trim() || "",
  ].join("|");
  const hex = await sha256Hex(material);
  return hex.slice(0, 16);
}

export async function hashAdFraudIp(ip: string, salt: string): Promise<string | undefined> {
  const cleaned = ip.trim();
  if (!cleaned || cleaned === "127.0.0.1" || cleaned === "::1") {
    // Still hash localhost for tests/dev consistency.
  }
  if (!cleaned) return undefined;
  const hex = await sha256Hex(`${salt.trim()}|ip|${cleaned}`);
  return hex.slice(0, 16);
}

export async function hashClickIdHint(
  clickId: string | undefined,
  salt: string,
): Promise<string | undefined> {
  if (!clickId?.trim()) return undefined;
  const hex = await sha256Hex(`${salt.trim()}|click|${clickId.trim()}`);
  return hex.slice(0, 12);
}

export function anonymisedVisitorLabel(visitorHash: string): string {
  const id = visitorHash.replace(/[^a-f0-9]/gi, "").slice(0, 12) || "unknown";
  return `vis_${id}`;
}

/**
 * Transparent heuristic scoring — indicators only, not proof of competitor fraud.
 * Genuine quote/booking/contact activity suppresses elevated risk.
 */
export function scoreAdFraudVisitor(input: AdFraudScoreInput): AdFraudScoreResult {
  const reasons: string[] = [];
  let score = 0;
  const paid24 = Math.max(0, Math.floor(input.paidVisits24h));
  const paid7 = Math.max(0, Math.floor(input.paidVisits7d));

  if (input.hasMeaningfulEngagement) {
    // Genuine customers may compare prices repeatedly.
    if (paid24 >= 8) {
      score += 5;
      reasons.push("Multiple paid-ad visits in 24h, but meaningful engagement was recorded");
    }
    return {
      score,
      risk: "normal",
      reasons:
        reasons.length > 0
          ? reasons
          : ["Meaningful engagement recorded — not flagged as suspicious"],
    };
  }

  if (paid24 >= 8) {
    score += 70;
    reasons.push("8+ paid-ad visits within 24 hours with no meaningful interaction");
  } else if (paid24 >= 5) {
    score += 45;
    reasons.push("5–7 paid-ad visits within 24 hours with no quote/booking/contact activity");
  } else if (paid24 >= 3 && !input.hasQuoteActivity) {
    score += 20;
    reasons.push("3–4 paid-ad visits within 24 hours with no quote activity");
  }

  if (paid7 >= 8 && !input.hasMeaningfulEngagement) {
    score += 25;
    reasons.push("8+ paid-ad visits over 7 days with no meaningful interaction");
  }

  if (paid7 >= 12 && paid24 >= 2 && !input.hasMeaningfulEngagement) {
    score += 15;
    reasons.push("Unusually repetitive paid-ad activity over several days with no engagement");
  }

  let risk: AdFraudRiskLevel = "normal";
  if (score >= 70) risk = "high";
  else if (score >= 40) risk = "medium";
  else if (score >= 15) risk = "low";

  if (reasons.length === 0) {
    reasons.push("No elevated suspicion indicators");
  }

  return { score, risk, reasons };
}

export function countEventsInWindow(
  events: Pick<AdFraudEventRecord, "eventType" | "timestamp">[],
  eventType: AdFraudEventType,
  sinceMs: number,
): number {
  return events.filter(
    (event) => event.eventType === eventType && Date.parse(event.timestamp) >= sinceMs,
  ).length;
}

export function visitorHasEventTypes(
  events: Pick<AdFraudEventRecord, "eventType">[],
  types: ReadonlySet<AdFraudEventType>,
): boolean {
  return events.some((event) => types.has(event.eventType));
}

export function recomputeVisitorScore(
  visitor: Pick<AdFraudVisitorRecord, "events">,
  nowMs: number = Date.now(),
): AdFraudScoreResult {
  const dayMs = 24 * 60 * 60 * 1000;
  return scoreAdFraudVisitor({
    paidVisits24h: countEventsInWindow(visitor.events, "paid_visit", nowMs - dayMs),
    paidVisits7d: countEventsInWindow(visitor.events, "paid_visit", nowMs - 7 * dayMs),
    hasQuoteActivity: visitorHasEventTypes(visitor.events, QUOTE_ACTIVITY_EVENTS),
    hasMeaningfulEngagement: visitorHasEventTypes(visitor.events, MEANINGFUL_ENGAGEMENT_EVENTS),
  });
}

export function validateAdFraudIngestPayload(body: unknown):
  | { ok: true; eventType: AdFraudEventType; sessionId?: string; landingPath?: string; referrerHost?: string; userAgentNorm?: string; attribution?: AdsAttribution; meta?: Record<string, string> }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid payload" };
  }
  const input = body as AdFraudIngestPayload;
  if (!isAdFraudEventType(input.eventType)) {
    return { ok: false, error: "Invalid event type" };
  }
  // Never trust client IP / visitorHash.
  if (input.ip != null || input.visitorHash != null) {
    // Silently ignore — do not reject (older clients might send).
  }
  const attribution = sanitizeAdsAttribution(input.attribution);
  if (input.eventType === "paid_visit" && !isPaidAdAttribution(attribution)) {
    return { ok: false, error: "paid_visit requires advertising attribution parameters" };
  }
  return {
    ok: true,
    eventType: input.eventType,
    sessionId: normalizeSessionId(input.sessionId),
    landingPath: normalizeLandingPath(input.landingPath),
    referrerHost: normalizeReferrerHost(input.referrer),
    userAgentNorm: normalizeUserAgent(
      typeof input.userAgent === "string" ? input.userAgent : undefined,
    ),
    attribution,
    meta: sanitizeAdFraudMeta(input.meta),
  };
}

export function adFraudEventKey(id: string): string {
  return `ad-fraud:event:${id}`;
}

export function adFraudVisitorKey(visitorHash: string): string {
  return `ad-fraud:visitor:${visitorHash}`;
}

export function adFraudDayKey(isoDay: string): string {
  return `ad-fraud:day:${isoDay}`;
}

export function adFraudRateKey(ipHash: string, hourBucket: string): string {
  return `ad-fraud:rate:${ipHash}:${hourBucket}`;
}

export function utcDayString(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function generateAdFraudEventId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `afe_${rand.slice(0, 24)}`;
}
