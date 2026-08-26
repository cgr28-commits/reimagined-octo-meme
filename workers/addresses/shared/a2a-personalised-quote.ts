/**
 * Address-to-Address personalised quote requests.
 * Customer submits journey details (no instant price) → Owner sets Quote Price +
 * validity minutes (any integer ≥ 1) → SumUp payment link → Confirmed / Expired.
 */

import type { PaidBookingDetails } from "./booking-notifications";

export const A2A_QUOTE_STATUSES = [
  "AWAITING_QUOTE",
  "QUOTE_APPROVED_AWAITING_PAYMENT",
  "CONFIRMED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type A2aQuoteStatus = (typeof A2A_QUOTE_STATUSES)[number];

/** Minimum validity Owner may grant (minutes). Any integer ≥ this is allowed. */
export const A2A_QUOTE_VALIDITY_MIN_MINUTES = 1;
/** Soft upper bound to prevent accidental multi-day links (24 hours). */
export const A2A_QUOTE_VALIDITY_MAX_MINUTES = 24 * 60;
export const A2A_QUOTE_VALIDITY_DEFAULT_MINUTES = 60;

/** Quick-pick chips on the Owner approve form (free-form minutes still allowed). */
export const A2A_QUOTE_VALIDITY_PRESETS_MINUTES = [5, 10, 15, 30, 60] as const;

/**
 * Warn when pickup is soon so Owner can shorten quote validity.
 * Returns null when pickup is unknown, already past, or more than 3 hours away.
 */
export function buildA2aPickupValidityWarning(options: {
  minutesUntilPickup: number | null;
  selectedValidityMinutes?: number | null;
}): string | null {
  const mins = options.minutesUntilPickup;
  if (mins == null || !Number.isFinite(mins) || mins <= 0) {
    return null;
  }
  const rounded = Math.max(1, Math.round(mins));
  // Only nudge when pickup is within 3 hours.
  if (rounded > 180) {
    return null;
  }

  const selected = options.selectedValidityMinutes;
  if (
    typeof selected === "number" &&
    Number.isFinite(selected) &&
    selected > rounded
  ) {
    return `Pickup is in ${rounded} minutes — your ${selected}-minute validity is longer than time to pickup. Consider a shorter quote validity.`;
  }

  return `Pickup is in ${rounded} minutes — consider a shorter quote validity.`;
}

export type A2aQuoteRequestRecord = {
  /** Public reference e.g. MATNI-AQ-… */
  reference: string;
  /** Non-guessable payment token (URL secret). */
  paymentToken: string;
  status: A2aQuoteStatus;
  /** Current offered / approved journey (may differ from originalRequest). */
  booking: PaidBookingDetails;
  /**
   * Immutable snapshot of what the customer originally submitted.
   * Used to detect counter-offers when Owner edits before approval.
   */
  originalBooking?: PaidBookingDetails;
  createdAt: string;
  updatedAt: string;
  /** Owner-entered quote price (GBP) — set on approve. */
  quotedPrice?: number;
  quoteApprovedAt?: string;
  /** Owner-chosen validity in whole minutes (any integer ≥ 1). */
  quoteValidityMinutes?: number;
  /** Server-computed expiry ISO — never trust the browser. */
  quoteExpiresAt?: string;
  checkoutId?: string;
  checkoutReference?: string;
  paymentUrl?: string;
  paymentReference?: string;
  paidAt?: string;
  paymentLinkEmailSentAt?: string;
  paymentLinkEmailPayUrl?: string;
  /** True when approval email was framed as a counter-offer. */
  isCounterOffer?: boolean;
  expiredAt?: string;
  cancelledAt?: string;
};

/** Material journey fields Owner may amend before approval. */
export type A2aMaterialJourneyField =
  | "pickupLabel"
  | "dropoffLabel"
  | "tripDate"
  | "tripTime"
  | "returnDate"
  | "returnTime"
  | "passengers"
  | "suitcases";

export type A2aJourneyChange = {
  field: A2aMaterialJourneyField;
  label: string;
  requested: string;
  offered: string;
};

function normText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function journeyFieldLabel(field: A2aMaterialJourneyField): string {
  switch (field) {
    case "pickupLabel":
      return "Pickup";
    case "dropoffLabel":
      return "Destination";
    case "tripDate":
      return "Date";
    case "tripTime":
      return "Time";
    case "returnDate":
      return "Return date";
    case "returnTime":
      return "Return time";
    case "passengers":
      return "Passengers";
    case "suitcases":
      return "Luggage";
    default:
      return field;
  }
}

function fieldDisplayValue(
  booking: PaidBookingDetails,
  field: A2aMaterialJourneyField,
  normaliseAddress: (label: string) => string,
): string {
  switch (field) {
    case "pickupLabel":
      return normaliseAddress(booking.pickupLabel);
    case "dropoffLabel":
      return normaliseAddress(booking.dropoffLabel);
    case "tripDate":
      return normText(booking.tripDate);
    case "tripTime":
      return normText(booking.tripTime);
    case "returnDate":
      return booking.returnJourney ? normText(booking.returnDate) : "";
    case "returnTime":
      return booking.returnJourney ? normText(booking.returnTime) : "";
    case "passengers":
      return String(Number(booking.passengers) || 1);
    case "suitcases":
      return String(Number(booking.suitcases) || 0);
    default:
      return "";
  }
}

/**
 * Compare original customer request vs current offered booking.
 * Address labels should already be normalised (or pass a normaliser).
 */
export function listA2aJourneyChanges(
  original: PaidBookingDetails | null | undefined,
  offered: PaidBookingDetails,
  normaliseAddress: (label: string) => string = (v) => normText(v),
): A2aJourneyChange[] {
  if (!original) return [];
  const fields: A2aMaterialJourneyField[] = [
    "pickupLabel",
    "dropoffLabel",
    "tripDate",
    "tripTime",
    "returnDate",
    "returnTime",
    "passengers",
    "suitcases",
  ];
  const changes: A2aJourneyChange[] = [];
  for (const field of fields) {
    const requested = fieldDisplayValue(original, field, normaliseAddress);
    const next = fieldDisplayValue(offered, field, normaliseAddress);
    if (requested.toLowerCase() !== next.toLowerCase()) {
      changes.push({
        field,
        label: journeyFieldLabel(field),
        requested: requested || "—",
        offered: next || "—",
      });
    }
  }
  return changes;
}

export function isA2aCounterOffer(
  original: PaidBookingDetails | null | undefined,
  offered: PaidBookingDetails,
  normaliseAddress?: (label: string) => string,
): boolean {
  return listA2aJourneyChanges(original, offered, normaliseAddress).length > 0;
}

/** Prefer stored original snapshot; fall back to current booking for legacy rows. */
export function resolveA2aOriginalBooking(
  record: Pick<A2aQuoteRequestRecord, "booking" | "originalBooking">,
): PaidBookingDetails {
  return record.originalBooking ?? record.booking;
}

export function a2aQuoteRefKey(reference: string): string {
  return `a2a-quote:ref:${reference.trim()}`;
}

export function a2aQuoteTokenKey(token: string): string {
  return `a2a-quote:token:${token.trim()}`;
}

export function a2aQuoteCheckoutKey(checkoutId: string): string {
  return `a2a-quote:checkout:${checkoutId.trim()}`;
}

export function a2aQuoteOpenIndexKey(): string {
  return "a2a-quote:open";
}

/** All A2A quote refs (including paid / expired) for owner history filters. */
export function a2aQuoteHistoryIndexKey(): string {
  return "a2a-quote:history";
}

export function isA2aQuoteOpenStatus(status: A2aQuoteStatus): boolean {
  return status === "AWAITING_QUOTE" || status === "QUOTE_APPROVED_AWAITING_PAYMENT";
}

/**
 * Parse Owner-entered validity. Accepts any whole number of minutes
 * (1, 10, 60, …) within the configured range. Rejects decimals / empty.
 */
export function normalizeA2aQuoteValidityMinutes(raw: unknown): number | null {
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < A2A_QUOTE_VALIDITY_MIN_MINUTES || n > A2A_QUOTE_VALIDITY_MAX_MINUTES) {
    return null;
  }
  return n;
}

export function normalizeA2aQuotedPriceGbp(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 5000) return null;
  return Math.round(n * 100) / 100;
}

/** Server-side expiry from approval instant + Owner validity minutes. */
export function computeA2aQuoteExpiresAtIso(
  approvedAtIso: string,
  validityMinutes: number,
): string {
  const approved = new Date(approvedAtIso);
  const baseMs = Number.isNaN(approved.getTime()) ? Date.now() : approved.getTime();
  return new Date(baseMs + validityMinutes * 60 * 1000).toISOString();
}

export function formatA2aQuoteValidityLabel(minutes: number): string {
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "1 hour";
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} minutes`;
  return `${hours}h ${mins}m`;
}

export function isA2aQuotePayable(record: A2aQuoteRequestRecord, now = new Date()): boolean {
  if (record.status !== "QUOTE_APPROVED_AWAITING_PAYMENT") return false;
  if (record.paymentReference || record.paidAt) return false;
  if (typeof record.quotedPrice !== "number" || !(record.quotedPrice > 0)) return false;
  if (!record.quoteExpiresAt) return false;
  const expires = new Date(record.quoteExpiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) return false;
  return true;
}

export function a2aQuoteStatusLabel(status: A2aQuoteStatus): string {
  switch (status) {
    case "AWAITING_QUOTE":
      return "Awaiting Quote";
    case "QUOTE_APPROVED_AWAITING_PAYMENT":
      return "Quote Approved – Awaiting Payment";
    case "CONFIRMED":
      return "Confirmed";
    case "EXPIRED":
      return "Expired";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export const A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE =
  "This quote has expired because availability may have changed. Please request a new quote.";
