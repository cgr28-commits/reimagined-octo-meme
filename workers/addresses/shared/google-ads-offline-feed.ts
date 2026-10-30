/**
 * Daily "Import from clicks" file for Google Ads scheduled uploads (Goals → Conversions →
 * Uploads → Schedules → HTTPS). Used instead of the Google Ads API, which this business's
 * Cloud project is not approved to call for live accounts.
 *
 * Only real, active paid bookings that carry a Google click ID captured after the visitor
 * accepted measurement cookies are listed. Re-listing a booking every day is safe: Google
 * rejects a repeat of the same click ID + conversion name + conversion time as a duplicate.
 */
import type { PaidBookingRecord } from "./paid-booking-record";

/** Must match the Google Ads conversion action name exactly ("Import from clicks" action). */
export const OFFLINE_FEED_CONVERSION_NAME = "PAID BOOKING-SERVER";

/** How far back the file reaches. The action's click-through window is 90 days. */
export const OFFLINE_FEED_LOOKBACK_DAYS = 60;

export const OFFLINE_FEED_HEADERS = [
  "Google Click ID",
  "Conversion Name",
  "Conversion Time",
  "Conversion Value",
  "Conversion Currency",
  "Order ID",
  "Ad User Data",
  "Ad Personalization",
  "Event Source",
] as const;

export type OfflineFeedRow = {
  gclid: string;
  conversionTime: string;
  value: number;
  currency: string;
  orderId: string;
};

type FeedRecord = Pick<
  PaidBookingRecord,
  | "paymentReference"
  | "createdAt"
  | "status"
  | "amount"
  | "currency"
  | "totalFare"
  | "attribution"
  | "isRefundTest"
  | "isAmendmentTestFixture"
  | "cancelledAt"
  | "refundedAt"
  | "operationalStatus"
> & { googleAdsPaidConversionStatus?: string };

const ACTIVE_STATUSES = new Set(["confirmed", "partially_refunded"]);
const GCLID_PATTERN = /^[A-Za-z0-9_-]{10,300}$/;

/**
 * "2026-10-20 12:00:35+0000" — the zone sits in each value because Data Manager reads the
 * first line as the column headers (a "Parameters:TimeZone" line would hide every column).
 */
export function formatFeedTimeUtc(iso: string): string | null {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return null;
  return `${time.toISOString().slice(0, 19).replace("T", " ")}+0000`;
}

export function offlineFeedRowFor(record: FeedRecord, nowMs = Date.now()): OfflineFeedRow | null {
  if (record.isRefundTest || record.isAmendmentTestFixture) return null;
  if (record.cancelledAt || record.refundedAt || record.operationalStatus === "cancelled") return null;
  if (!ACTIVE_STATUSES.has(String(record.status))) return null;
  // Older records kept a click ID captured before consent; never send those.
  if (record.googleAdsPaidConversionStatus === "skipped_no_consent") return null;

  const gclid = record.attribution?.gclid?.trim() ?? "";
  if (!GCLID_PATTERN.test(gclid)) return null;

  const conversionTime = formatFeedTimeUtc(record.createdAt);
  if (!conversionTime) return null;
  const ageMs = nowMs - Date.parse(record.createdAt);
  if (ageMs < 0 || ageMs > OFFLINE_FEED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) return null;

  const value =
    typeof record.totalFare === "number" && record.totalFare > 0 ? record.totalFare : record.amount;
  if (!Number.isFinite(value) || value <= 0) return null;

  return {
    gclid,
    conversionTime,
    value: Math.round(value * 100) / 100,
    currency: (record.currency || "GBP").toUpperCase(),
    orderId: record.paymentReference.trim(),
  };
}

function csvField(value: string): string {
  // Neutralise spreadsheet formulas and quote anything with separators.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Unique, time-ordered rows for the file (and the owner's list). */
export function offlineFeedRows(records: FeedRecord[], nowMs = Date.now()): OfflineFeedRow[] {
  const seen = new Set<string>();
  const rows: OfflineFeedRow[] = [];
  for (const record of records) {
    const row = offlineFeedRowFor(record, nowMs);
    if (!row || seen.has(row.orderId)) continue;
    seen.add(row.orderId);
    rows.push(row);
  }
  return rows.sort((a, b) => a.conversionTime.localeCompare(b.conversionTime));
}

export function buildOfflineFeedCsv(records: FeedRecord[], nowMs = Date.now()): { csv: string; rows: number } {
  const rows = offlineFeedRows(records, nowMs);

  const lines = [
    OFFLINE_FEED_HEADERS.join(","),
    ...rows.map((row) =>
      [
        row.gclid,
        OFFLINE_FEED_CONVERSION_NAME,
        row.conversionTime,
        row.value.toFixed(2),
        row.currency,
        row.orderId,
        // The click ID is only stored after the visitor accepted cookies, which grants both.
        "Granted",
        "Granted",
        // Bookings are made and paid for on the website.
        "WEB",
      ]
        .map(csvField)
        .join(","),
    ),
  ];
  return { csv: `${lines.join("\r\n")}\r\n`, rows: rows.length };
}

/** Constant-time string comparison for the feed password. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Parse "Authorization: Basic …" → { username, password }. */
export function parseBasicAuth(header: string | null): { username: string; password: string } | null {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  let decoded = "";
  try {
    decoded = atob(match[1]);
  } catch {
    return null;
  }
  const split = decoded.indexOf(":");
  if (split <= 0) return null;
  return { username: decoded.slice(0, split), password: decoded.slice(split + 1) };
}
