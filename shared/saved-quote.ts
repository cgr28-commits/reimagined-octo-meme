/**
 * Saved Quote — customer-saved fixed-price quotes with 7-day validity
 * and transactional follow-up emails. Persisted in Cloudflare KV (TRACKING_STORE).
 *
 * Secure retrieval uses a cryptographically random token — never sequential IDs,
 * never the quote reference alone, never the price in the URL.
 */

export const SAVED_QUOTE_VALIDITY_DAYS = 7;
export const SAVED_QUOTE_TTL_SECONDS = 60 * 60 * 24 * 30; // keep KV a bit past expiry for audit
export const SAVED_QUOTE_FIRST_REMINDER_HOURS = 24;
export const SAVED_QUOTE_FINAL_REMINDER_DAYS = 5;

export type SavedQuoteStatus = "saved" | "booked" | "expired";

/** Journey + pricing snapshot frozen at save time (fixed price for 7 days). */
export type SavedQuoteJourneySnapshot = {
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
  isAirportTrip: boolean;
  isFromAirport?: boolean;
  journeyType?: string;
  /** Optional at save — empty string means not set (booking still requires date/time). */
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  childSeats?: number;
  childSeatNotes?: string;
  vehicle: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  tripLabel: string;
  journeyDistance?: string;
  journeyDuration?: string;
};

export type SavedQuotePricingSnapshot = {
  /** Authoritative total GBP locked for the validity window. */
  totalAmount: number;
  outboundAmount?: number;
  returnAmount?: number;
  currency: "GBP";
  amountLabel: string;
  /** Client-submitted amount kept for audit only — never authoritative. */
  clientSubmittedAmount?: number;
  /** Optional audit metadata from the quote engine. */
  pricingMeta?: Record<string, unknown>;
};

export type SavedQuoteRecord = {
  id: string;
  reference: string;
  /** Cryptographically secure opaque token used in customer URLs. */
  token: string;
  customerName: string;
  customerEmail: string;
  journey: SavedQuoteJourneySnapshot;
  pricing: SavedQuotePricingSnapshot;
  status: SavedQuoteStatus;
  createdAt: string;
  expiresAt: string;
  bookedAt?: string;
  bookingId?: string;
  paymentReference?: string;
  checkoutId?: string;
  initialEmailSentAt?: string;
  firstReminderSentAt?: string;
  finalReminderSentAt?: string;
  /** Best-effort claim before send (KV race narrowing). */
  firstReminderClaimId?: string;
  firstReminderClaimedAt?: string;
  finalReminderClaimId?: string;
  finalReminderClaimedAt?: string;
  /** Last email send error (not marked sent until success). */
  lastEmailError?: string;
};

/** Public customer-safe view (never includes internal error strings). */
export type SavedQuotePublicSummary = {
  reference: string;
  token: string;
  customerName: string;
  customerEmail: string;
  status: SavedQuoteStatus;
  createdAt: string;
  expiresAt: string;
  expiresAtLabel: string;
  amount: number;
  amountLabel: string;
  currency: "GBP";
  journey: SavedQuoteJourneySnapshot;
  bookedAt?: string;
  paymentReference?: string;
  bookUrl: string;
};

export function savedQuoteTokenKey(token: string): string {
  return `saved-quote:token:${normalizeSavedQuoteToken(token)}`;
}

export function savedQuoteOpenIndexKey(): string {
  return "saved-quote:open-index";
}

export function normalizeSavedQuoteToken(token: string): string {
  return String(token ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
}

export function generateSavedQuoteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateSavedQuoteId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Human-readable unique reference: MAT-YYMMDD-HHMM + short random suffix.
 * Not used as the sole security mechanism for retrieval.
 */
export function generateSavedQuoteReference(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const stamp = `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}`;
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `MAT-${stamp}-${suffix}`;
}

export function computeSavedQuoteExpiresAt(createdAt: Date = new Date()): string {
  const expires = new Date(createdAt.getTime() + SAVED_QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

export function formatSavedQuoteAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `£${rounded.toFixed(2)}`;
}

/**
 * Lock the authoritative saved-quote fare from a trusted server calculation.
 * Client-submitted amounts are audit-only and never become totalAmount.
 */
export function lockSavedQuotePricingFromServer(input: {
  serverAmount: number;
  amountLabel?: string;
  clientSubmittedAmount?: number;
  pricingMeta?: Record<string, unknown>;
}): SavedQuotePricingSnapshot {
  const totalAmount = Math.round(Number(input.serverAmount) * 100) / 100;
  if (!Number.isFinite(totalAmount) || totalAmount < 1) {
    throw new Error("Invalid server quote amount");
  }
  const clientSubmittedAmount =
    typeof input.clientSubmittedAmount === "number" &&
    Number.isFinite(input.clientSubmittedAmount) &&
    input.clientSubmittedAmount > 0
      ? Math.round(input.clientSubmittedAmount * 100) / 100
      : undefined;
  const mismatch =
    typeof clientSubmittedAmount === "number" &&
    Math.abs(clientSubmittedAmount - totalAmount) >= 0.01;

  return {
    totalAmount,
    currency: "GBP",
    amountLabel: input.amountLabel || formatSavedQuoteAmount(totalAmount),
    ...(typeof clientSubmittedAmount === "number" ? { clientSubmittedAmount } : {}),
    pricingMeta: {
      ...(input.pricingMeta ?? {}),
      ...(mismatch
        ? {
            clientAmountMismatch: true,
            clientSubmittedAmount,
            serverAmount: totalAmount,
          }
        : {}),
    },
  };
}

export function formatSavedQuoteExpiryLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function isSavedQuoteExpired(
  record: Pick<SavedQuoteRecord, "expiresAt" | "status">,
  now = new Date(),
): boolean {
  if (record.status === "expired") return true;
  const expiresMs = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= now.getTime();
}

export function evaluateSavedQuoteAccess(
  record: SavedQuoteRecord | null | undefined,
  now = new Date(),
):
  | { ok: true; record: SavedQuoteRecord; effectiveStatus: SavedQuoteStatus }
  | { ok: false; error: "not_found" | "expired" | "booked"; record?: SavedQuoteRecord } {
  if (!record?.token || !record.reference) {
    return { ok: false, error: "not_found" };
  }
  if (record.status === "booked") {
    return { ok: false, error: "booked", record };
  }
  if (isSavedQuoteExpired(record, now)) {
    return { ok: false, error: "expired", record };
  }
  return { ok: true, record, effectiveStatus: "saved" };
}

export function buildSavedQuoteCustomerUrl(
  token: string,
  origin = "https://www.myairporttaxini.co.uk",
): string {
  const base = origin.replace(/\/$/, "");
  // Query-string token — static-export friendly (GitHub Pages), same pattern as personal quotes.
  return `${base}/quote/?t=${encodeURIComponent(normalizeSavedQuoteToken(token))}`;
}

export function toSavedQuotePublicSummary(
  record: SavedQuoteRecord,
  origin = "https://www.myairporttaxini.co.uk",
): SavedQuotePublicSummary {
  return {
    reference: record.reference,
    token: record.token,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    status: record.status,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    expiresAtLabel: formatSavedQuoteExpiryLabel(record.expiresAt),
    amount: record.pricing.totalAmount,
    amountLabel: record.pricing.amountLabel,
    currency: "GBP",
    journey: record.journey,
    bookedAt: record.bookedAt,
    paymentReference: record.paymentReference,
    bookUrl: buildSavedQuoteCustomerUrl(record.token, origin),
  };
}

export function hoursSince(iso: string, now = new Date()): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  return (now.getTime() - ms) / (1000 * 60 * 60);
}

export function shouldSendFirstReminder(record: SavedQuoteRecord, now = new Date()): boolean {
  if (record.status !== "saved") return false;
  if (isSavedQuoteExpired(record, now)) return false;
  if (record.firstReminderSentAt) return false;
  return hoursSince(record.createdAt, now) >= SAVED_QUOTE_FIRST_REMINDER_HOURS;
}

export function shouldSendFinalReminder(record: SavedQuoteRecord, now = new Date()): boolean {
  if (record.status !== "saved") return false;
  if (isSavedQuoteExpired(record, now)) return false;
  if (record.finalReminderSentAt) return false;
  return hoursSince(record.createdAt, now) >= SAVED_QUOTE_FINAL_REMINDER_DAYS * 24;
}

/**
 * Journey identity used to decide whether a saved quote is the same trip as a
 * booking. Email alone is never sufficient.
 */
export type SavedQuoteJourneyMatchInput = {
  customerEmail: string;
  pickupLabel: string;
  dropoffLabel: string;
  pickupPlaceId?: string;
  dropoffPlaceId?: string;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  isFromAirport?: boolean;
  tripDirection?: string;
};

/**
 * Authoritative booking fields that decide whether reminders must stop.
 * Failed, abandoned, and unpaid checkouts are not suppressing states.
 */
export type SavedQuoteBookingSuppressionView = {
  status?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  isRefundTest?: boolean;
  isAmendmentTestFixture?: boolean;
};

const REMINDER_SUPPRESSING_BOOKING_STATUSES = new Set([
  "confirmed",
  "partially_refunded",
  "refunded_active",
]);

const REMINDER_NON_SUPPRESSING_STATES = new Set([
  "cancelled",
  "refunded",
  "awaiting_payment",
  "abandoned",
  "failed",
  "expired",
  "pending",
  "pending_payment",
  "unpaid",
]);

export function normalizeSavedQuoteEmail(email: string | undefined | null): string {
  return String(email ?? "").trim().toLowerCase();
}

export function normalizeSavedQuoteDate(value: string | undefined | null): string {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

/** 9:00 and 09:00:00 are the same pickup time. Empty stays empty. */
export function normalizeSavedQuoteClock(value: string | undefined | null): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeSavedQuoteAddress(value: string | undefined | null): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,/#]/g, " ")
    .replace(/\b(united kingdom|uk|northern ireland)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSavedQuotePlaceId(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function savedQuotePlacesMatch(
  placeIdA: string | undefined,
  labelA: string | undefined,
  placeIdB: string | undefined,
  labelB: string | undefined,
): boolean {
  const idA = normalizeSavedQuotePlaceId(placeIdA);
  const idB = normalizeSavedQuotePlaceId(placeIdB);
  if (idA && idB) return idA === idB;
  const left = normalizeSavedQuoteAddress(labelA);
  const right = normalizeSavedQuoteAddress(labelB);
  return Boolean(left) && left === right;
}

function savedQuoteDirectionsMatch(
  left: SavedQuoteJourneyMatchInput,
  right: SavedQuoteJourneyMatchInput,
): boolean {
  if (
    typeof left.isFromAirport === "boolean" &&
    typeof right.isFromAirport === "boolean" &&
    left.isFromAirport !== right.isFromAirport
  ) {
    return false;
  }
  const directionA = String(left.tripDirection ?? "").trim().toLowerCase();
  const directionB = String(right.tripDirection ?? "").trim().toLowerCase();
  if (directionA && directionB && directionA !== directionB) return false;
  return true;
}

/**
 * True only when both sides are the same customer journey.
 * A shared email with a different date, time, address, direction, or return is not a match.
 */
export function savedQuotesShareJourney(
  left: SavedQuoteJourneyMatchInput,
  right: SavedQuoteJourneyMatchInput,
): boolean {
  const emailA = normalizeSavedQuoteEmail(left.customerEmail);
  const emailB = normalizeSavedQuoteEmail(right.customerEmail);
  if (!emailA || emailA !== emailB) return false;

  const dateA = normalizeSavedQuoteDate(left.tripDate);
  const dateB = normalizeSavedQuoteDate(right.tripDate);
  if (!dateA || dateA !== dateB) return false;

  const timeA = normalizeSavedQuoteClock(left.tripTime);
  const timeB = normalizeSavedQuoteClock(right.tripTime);
  if (!timeA || timeA !== timeB) return false;

  if (
    !savedQuotePlacesMatch(left.pickupPlaceId, left.pickupLabel, right.pickupPlaceId, right.pickupLabel)
  ) {
    return false;
  }
  if (
    !savedQuotePlacesMatch(
      left.dropoffPlaceId,
      left.dropoffLabel,
      right.dropoffPlaceId,
      right.dropoffLabel,
    )
  ) {
    return false;
  }

  const returnA = Boolean(left.returnJourney);
  const returnB = Boolean(right.returnJourney);
  if (returnA !== returnB) return false;
  if (returnA) {
    const returnDateA = normalizeSavedQuoteDate(left.returnDate);
    const returnDateB = normalizeSavedQuoteDate(right.returnDate);
    if (!returnDateA || returnDateA !== returnDateB) return false;
    const returnTimeA = normalizeSavedQuoteClock(left.returnTime);
    const returnTimeB = normalizeSavedQuoteClock(right.returnTime);
    if (!returnTimeA || returnTimeA !== returnTimeB) return false;
  }

  return savedQuoteDirectionsMatch(left, right);
}

export function savedQuoteJourneyMatchFromRecord(
  record: Pick<SavedQuoteRecord, "customerEmail" | "journey">,
): SavedQuoteJourneyMatchInput {
  return {
    customerEmail: record.customerEmail,
    pickupLabel: record.journey.pickupLabel,
    dropoffLabel: record.journey.dropoffLabel,
    pickupPlaceId: record.journey.pickupPlaceId,
    dropoffPlaceId: record.journey.dropoffPlaceId,
    tripDate: record.journey.tripDate,
    tripTime: record.journey.tripTime,
    returnJourney: Boolean(record.journey.returnJourney),
    returnDate: record.journey.returnDate,
    returnTime: record.journey.returnTime,
    isFromAirport: record.journey.isFromAirport,
    tripDirection: record.journey.tripDirection,
  };
}

/**
 * Confirmed / accepted journeys and successfully paid bookings stop reminders.
 * Cancelled journeys, refund-tests, and failed or abandoned checkouts do not.
 */
export function bookingSuppressesSavedQuoteReminders(
  booking: SavedQuoteBookingSuppressionView,
): boolean {
  if (booking.isRefundTest || booking.isAmendmentTestFixture) return false;
  const status = String(booking.status ?? "").trim().toLowerCase();
  const operational = String(booking.operationalStatus ?? "").trim().toLowerCase();
  const payment = String(booking.paymentStatus ?? "").trim().toLowerCase();

  if (operational === "cancelled" || status === "cancelled" || status === "refunded") return false;
  if (REMINDER_NON_SUPPRESSING_STATES.has(status) || REMINDER_NON_SUPPRESSING_STATES.has(payment)) {
    return false;
  }

  const paid =
    payment === "paid" ||
    payment === "partially_refunded" ||
    payment === "fully_refunded" ||
    REMINDER_SUPPRESSING_BOOKING_STATUSES.has(status);
  const confirmed =
    operational === "confirmed" ||
    (!operational && REMINDER_SUPPRESSING_BOOKING_STATUSES.has(status));
  if (payment === "fully_refunded" && operational !== "confirmed" && status !== "refunded_active") {
    return false;
  }
  return paid && confirmed;
}

export function savedQuoteReminderBlockedByBookings(
  record: Pick<SavedQuoteRecord, "customerEmail" | "journey">,
  bookings: Array<SavedQuoteJourneyMatchInput & SavedQuoteBookingSuppressionView>,
): boolean {
  const quote = savedQuoteJourneyMatchFromRecord(record);
  return bookings.some(
    (booking) =>
      bookingSuppressesSavedQuoteReminders(booking) && savedQuotesShareJourney(quote, booking),
  );
}

export function firstNameFromCustomerName(name: string): string {
  const part = String(name ?? "")
    .trim()
    .split(/\s+/)[0];
  return part || "there";
}
