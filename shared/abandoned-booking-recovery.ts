/**
 * Abandoned booking recovery — one transactional reminder ~1 hour after a
 * customer enters a valid email in the booking flow but does not complete payment.
 *
 * Not marketing. Opaque recovery tokens only — never PII in URLs.
 */

export const ABANDONED_BOOKING_REMINDER_DELAY_MS = 60 * 60 * 1000; // 1 hour
export const ABANDONED_BOOKING_EXPIRE_AFTER_MS = 48 * 60 * 60 * 1000; // 48 hours
export const ABANDONED_BOOKING_KV_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days hard TTL
export const ABANDONED_BOOKING_CLAIM_TTL_MS = 30 * 60 * 1000; // 30 min claim window

export type AbandonedBookingStatus =
  | "awaiting_reminder"
  | "reminder_sent"
  | "recovered"
  | "expired"
  | "opted_out";

export type AbandonedBookingJourneySnapshot = {
  pickupLabel: string;
  dropoffLabel: string;
  pickupPlaceId?: string;
  dropoffPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  airportCode?: string;
  tripMode?: string;
  tripDirection?: string;
  isAirportTrip?: boolean;
  isFromAirport?: boolean;
  journeyIntent?: string;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  exactPassengers?: number | null;
  vehicle?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  tripLabel?: string;
  journeyDistance?: string;
  journeyDuration?: string;
  quotedAmount?: number;
  quotedAmountLabel?: string;
  quoteStep?: 1 | 2 | 3;
};

export type AbandonedBookingRecord = {
  id: string;
  /** Opaque recovery token used in Continue My Booking links. */
  token: string;
  customerName: string;
  customerEmail: string;
  mobileNumber?: string;
  journey: AbandonedBookingJourneySnapshot;
  /** Dedup fingerprint: email + journey keys (not used in URLs). */
  fingerprint: string;
  checkoutId?: string;
  checkoutReference?: string;
  quoteReference?: string;
  status: AbandonedBookingStatus;
  createdAt: string;
  reminderDueAt: string;
  expiresAt: string;
  reminderSentAt?: string;
  reminderClaimId?: string;
  reminderClaimedAt?: string;
  recoveredAt?: string;
  paymentReference?: string;
  optedOutAt?: string;
  lastEmailError?: string;
};

export type AbandonedBookingOwnerView = {
  token: string;
  id: string;
  customerName: string;
  customerEmail: string;
  mobileNumber?: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  quotedAmountLabel?: string;
  status: AbandonedBookingStatus;
  statusLabel: string;
  createdAt: string;
  reminderDueAt: string;
  reminderSentAt?: string;
  recoveredAt?: string;
  checkoutId?: string;
  paymentReference?: string;
};

export type AbandonedBookingPublicResume = {
  token: string;
  status: AbandonedBookingStatus;
  customerName: string;
  customerEmail: string;
  mobileNumber?: string;
  journey: AbandonedBookingJourneySnapshot;
  expiresAt: string;
  /** When true, booking already paid — do not offer another payment. */
  alreadyPaid: boolean;
  paymentReference?: string;
};

export function abandonedBookingTokenKey(token: string): string {
  return `abandoned-booking:token:${normalizeAbandonedBookingToken(token)}`;
}

export function abandonedBookingOpenIndexKey(): string {
  return "abandoned-booking:open-index";
}

export function abandonedBookingFingerprintKey(fingerprint: string): string {
  return `abandoned-booking:fp:${normalizeFingerprint(fingerprint)}`;
}

export function abandonedBookingOptOutKey(email: string): string {
  return `abandoned-booking:optout:${normalizeEmail(email)}`;
}

export function normalizeAbandonedBookingToken(token: string): string {
  return String(token ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
}

export function normalizeEmail(email: string): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeFingerprint(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "")
    .slice(0, 180);
}

export function generateAbandonedBookingToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateAbandonedBookingId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function firstNameFromCustomerName(name: string): string {
  const first = String(name ?? "")
    .trim()
    .split(/\s+/)[0];
  return first || "there";
}

export function formatAbandonedAmount(amount: number | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return "";
  }
  return `£${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

export function computeAbandonedReminderDueAt(
  createdAt: Date,
  delayMs = ABANDONED_BOOKING_REMINDER_DELAY_MS,
): string {
  return new Date(createdAt.getTime() + delayMs).toISOString();
}

export function computeAbandonedExpiresAt(
  createdAt: Date,
  expireAfterMs = ABANDONED_BOOKING_EXPIRE_AFTER_MS,
): string {
  return new Date(createdAt.getTime() + expireAfterMs).toISOString();
}

/**
 * Stable fingerprint so re-entering the same email+journey upserts one record.
 * Never place this value in customer-facing URLs.
 */
export function buildAbandonedBookingFingerprint(input: {
  customerEmail: string;
  journey: Pick<
    AbandonedBookingJourneySnapshot,
    | "pickupLabel"
    | "dropoffLabel"
    | "tripDate"
    | "tripTime"
    | "returnDate"
    | "returnTime"
    | "passengers"
    | "suitcases"
    | "airportCode"
  >;
}): string {
  const email = normalizeEmail(input.customerEmail);
  const j = input.journey;
  const parts = [
    email,
    String(j.pickupLabel ?? "").trim().toLowerCase().slice(0, 80),
    String(j.dropoffLabel ?? "").trim().toLowerCase().slice(0, 80),
    String(j.tripDate ?? "").trim(),
    String(j.tripTime ?? "").trim(),
    String(j.returnDate ?? "").trim(),
    String(j.returnTime ?? "").trim(),
    String(j.passengers ?? ""),
    String(j.suitcases ?? ""),
    String(j.airportCode ?? "").trim().toUpperCase(),
  ];
  return normalizeFingerprint(parts.join("|"));
}

export function isAbandonedBookingExpired(
  record: Pick<AbandonedBookingRecord, "expiresAt" | "status">,
  now = new Date(),
): boolean {
  if (record.status === "expired") return true;
  const expiresMs = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= now.getTime();
}

export function isAbandonedBookingReminderDue(
  record: Pick<
    AbandonedBookingRecord,
    "status" | "reminderDueAt" | "reminderSentAt" | "expiresAt"
  >,
  now = new Date(),
): boolean {
  if (record.status !== "awaiting_reminder") return false;
  if (record.reminderSentAt) return false;
  if (isAbandonedBookingExpired(record, now)) return false;
  const dueMs = Date.parse(record.reminderDueAt);
  if (!Number.isFinite(dueMs)) return false;
  return now.getTime() >= dueMs;
}

export function abandonedBookingStatusLabel(status: AbandonedBookingStatus): string {
  switch (status) {
    case "awaiting_reminder":
      return "Awaiting reminder";
    case "reminder_sent":
      return "Reminder sent";
    case "recovered":
      return "Recovered";
    case "expired":
      return "Expired";
    case "opted_out":
      return "Opted out";
    default:
      return status;
  }
}

export function toAbandonedBookingOwnerView(
  record: AbandonedBookingRecord,
): AbandonedBookingOwnerView {
  return {
    token: record.token,
    id: record.id,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    mobileNumber: record.mobileNumber,
    pickupLabel: record.journey.pickupLabel,
    dropoffLabel: record.journey.dropoffLabel,
    tripDate: record.journey.tripDate,
    tripTime: record.journey.tripTime,
    quotedAmountLabel:
      record.journey.quotedAmountLabel || formatAbandonedAmount(record.journey.quotedAmount),
    status: record.status,
    statusLabel: abandonedBookingStatusLabel(record.status),
    createdAt: record.createdAt,
    reminderDueAt: record.reminderDueAt,
    reminderSentAt: record.reminderSentAt,
    recoveredAt: record.recoveredAt,
    checkoutId: record.checkoutId,
    paymentReference: record.paymentReference,
  };
}

export function buildAbandonedBookingRecoveryUrl(
  token: string,
  origin = "https://www.myairporttaxini.co.uk",
): string {
  const normalized = normalizeAbandonedBookingToken(token);
  const base = String(origin || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
  // Opaque token only — never email, name, phone, or price.
  return `${base}/?abr=${encodeURIComponent(normalized)}#quote`;
}

export function buildAbandonedBookingOptOutUrl(
  token: string,
  origin = "https://www.myairporttaxini.co.uk",
): string {
  const normalized = normalizeAbandonedBookingToken(token);
  const base = String(origin || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
  return `${base}/unsubscribe/?scope=booking-recovery&t=${encodeURIComponent(normalized)}`;
}

export function resolveAbandonedBookingDelayMs(
  envValue?: string | null,
  fallbackMs = ABANDONED_BOOKING_REMINDER_DELAY_MS,
): number {
  const raw = String(envValue ?? "").trim();
  if (!raw) return fallbackMs;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < 1) return fallbackMs;
  return Math.round(minutes * 60 * 1000);
}

/** Pure gate used by cron + tests before any email send attempt. */
export function shouldSendAbandonedBookingReminder(
  record: AbandonedBookingRecord,
  options: {
    now?: Date;
    optedOut?: boolean;
    alreadyPaid?: boolean;
    cancelledOrRefunded?: boolean;
  } = {},
): boolean {
  const now = options.now ?? new Date();
  if (options.optedOut) return false;
  if (options.alreadyPaid) return false;
  if (options.cancelledOrRefunded) return false;
  if (record.status === "recovered" || record.status === "opted_out") return false;
  if (record.reminderSentAt) return false;
  return isAbandonedBookingReminderDue(record, now);
}
