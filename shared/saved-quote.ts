/**
 * Saved Quote — customer-saved journey snapshots with 7-day validity
 * and customer-requested emails. Persisted in Cloudflare KV (TRACKING_STORE).
 *
 * Secure retrieval uses a cryptographically random token — never sequential IDs,
 * never the quote reference alone, never the price in the URL.
 */

import { parseLondonLocalDateTime } from "./uk-time";

export const SAVED_QUOTE_VALIDITY_DAYS = 7;
export const SAVED_QUOTE_TTL_SECONDS = 60 * 60 * 24 * 7; // maximum retrieval and retention window
export const SAVED_QUOTE_FIRST_REMINDER_HOURS = 24;
export const SAVED_QUOTE_FINAL_REMINDER_DAYS = 5;
/** Journeys less than this many hours away only get a short price hold (owner rule). */
export const SAVED_QUOTE_SHORT_NOTICE_HOURS = 24;
export const SAVED_QUOTE_SHORT_NOTICE_HOLD_SECONDS = 2 * 60 * 60;
/** Holds shorter than this are not worth offering (pickup is imminent). */
export const SAVED_QUOTE_MIN_HOLD_SECONDS = 15 * 60;
/** Customer wording when no pickup date/time was given, so no price is held. */
export const SAVED_QUOTE_ADD_SCHEDULE_COPY = "Add your date and time to see your fixed price.";

export type SavedQuoteStatus = "saved" | "booked" | "expired";

/**
 * Journey details at save time. With a pickup date/time a fixed-price Quick Quote
 * is held (see SavedQuoteHeldPrice); otherwise the fare is recalculated before booking.
 */
export type SavedQuoteJourneySnapshot = {
  pickupLabel: string;
  dropoffLabel: string;
  pickupPlaceId?: string;
  pickupPlaceName?: string;
  pickupCountryCode?: string;
  pickupPostalCode?: string;
  pickupStreetNumber?: string;
  dropoffPlaceName?: string;
  dropoffCountryCode?: string;
  dropoffPostalCode?: string;
  dropoffStreetNumber?: string;
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
  optionalMeetGreetSelected?: boolean;
  terminalAccessChoices?: import("./meet-greet").TerminalAccessChoices;
  outboundAirportAccessChoice?: "express" | "free" | "meet-greet";
  returnAirportAccessChoice?: "express" | "free" | "meet-greet";
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
  /** Original server-calculated total (the held price when heldPrice is set). */
  totalAmount: number;
  outboundAmount?: number;
  returnAmount?: number;
  currency: "GBP";
  amountLabel: string;
  /** Client-submitted amount kept for audit only — never authoritative. */
  clientSubmittedAmount?: number;
  /** Optional audit metadata from the quote engine. */
  pricingMeta?: Record<string, unknown>;
  airportChargesGbp?: number;
  returnSavingGbp?: number;
};

/**
 * Fixed-price booking link created alongside the saved quote: a Quick Quote priced
 * with the website engine and held until heldUntil (never past pickup).
 */
export type SavedQuoteHeldPrice = {
  quickQuoteId: string;
  bookingUrl: string;
  amount: number;
  amountLabel: string;
  /** ISO time the held price (Quick Quote) expires. */
  heldUntil: string;
};

export type SavedQuoteHeldPricePublic = SavedQuoteHeldPrice & { heldUntilLabel: string };

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
  /** Fixed-price booking link, when the journey had a pickup date and time. */
  heldPrice?: SavedQuoteHeldPrice;
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
  /** Present only while the held price is still valid. */
  heldPrice?: SavedQuoteHeldPricePublic;
};

export function savedQuoteTokenKey(token: string): string {
  return `saved-quote:token:${normalizeSavedQuoteToken(token)}`;
}

export function savedQuoteOpenIndexKey(): string {
  return "saved-quote:open-index";
}

export function normalizeSavedQuoteToken(token: string): string {
  const value = String(token ?? "").trim().toLowerCase();
  return /^[a-f0-9]{48}$/.test(value) ? value : "";
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

export function computeSavedQuoteExpiresAt(createdAt: Date = new Date(), validityDays = 7): string {
  const expires = new Date(createdAt.getTime() + Math.min(7, Math.max(1, validityDays)) * 24 * 60 * 60 * 1000);
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
  return `${base}/quote/#t=${encodeURIComponent(normalizeSavedQuoteToken(token))}`;
}

/** True when the journey has everything a held price depends on (pickup, and return if any). */
export function savedQuoteHasSchedule(
  journey: Pick<SavedQuoteJourneySnapshot, "tripDate" | "tripTime" | "returnJourney" | "returnDate" | "returnTime">,
): boolean {
  const filled = (v?: string) => String(v ?? "").trim() !== "";
  if (!filled(journey.tripDate) || !filled(journey.tripTime)) return false;
  if (journey.returnJourney && (!filled(journey.returnDate) || !filled(journey.returnTime))) return false;
  return true;
}

/**
 * How long to hold a saved quote's price, in seconds, or null for no hold.
 * - no pickup date/time (or return date/time on a return) → null
 * - pickup less than 24h away → 2 hours (owner rule), never past pickup
 * - otherwise → the saved quote's validity (default 7 days), never past pickup
 */
export function computeSavedQuoteHoldSeconds(input: {
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  validityDays?: number;
  now?: Date;
}): number | null {
  const journey = {
    tripDate: input.tripDate ?? "",
    tripTime: input.tripTime ?? "",
    returnJourney: Boolean(input.returnJourney),
    returnDate: input.returnDate,
    returnTime: input.returnTime,
  };
  if (!savedQuoteHasSchedule(journey)) return null;
  const pickup = parseLondonLocalDateTime(journey.tripDate.trim(), journey.tripTime.trim());
  if (!pickup) return null;
  const now = input.now ?? new Date();
  const secondsToPickup = Math.floor((pickup.getTime() - now.getTime()) / 1000);
  if (secondsToPickup <= 0) return null;
  const validitySeconds = Math.floor(
    (Date.parse(computeSavedQuoteExpiresAt(now, input.validityDays ?? SAVED_QUOTE_VALIDITY_DAYS)) - now.getTime()) / 1000,
  );
  const cap =
    secondsToPickup < SAVED_QUOTE_SHORT_NOTICE_HOURS * 60 * 60
      ? SAVED_QUOTE_SHORT_NOTICE_HOLD_SECONDS
      : validitySeconds;
  const seconds = Math.min(cap, secondsToPickup);
  return seconds >= SAVED_QUOTE_MIN_HOLD_SECONDS ? seconds : null;
}

/** The held price if it is still valid and the quote is still open. */
export function activeSavedQuoteHeldPrice(
  record: Pick<SavedQuoteRecord, "heldPrice" | "status">,
  now = new Date(),
): SavedQuoteHeldPrice | undefined {
  const held = record.heldPrice;
  if (!held || record.status !== "saved" || !held.bookingUrl) return undefined;
  const until = Date.parse(held.heldUntil);
  if (!Number.isFinite(until) || until <= now.getTime()) return undefined;
  return held;
}

export function toSavedQuotePublicSummary(
  record: SavedQuoteRecord,
  origin = "https://www.myairporttaxini.co.uk",
  now = new Date(),
): SavedQuotePublicSummary {
  const held = activeSavedQuoteHeldPrice(record, now);
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
    ...(held ? { heldPrice: { ...held, heldUntilLabel: formatSavedQuoteExpiryLabel(held.heldUntil) } } : {}),
  };
}

export function hoursSince(iso: string, now = new Date()): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  return (now.getTime() - ms) / (1000 * 60 * 60);
}

export function shouldSendFirstReminder(record: SavedQuoteRecord, now = new Date()): boolean {
  void record; void now;
  return false;
}

export function shouldSendFinalReminder(record: SavedQuoteRecord, now = new Date()): boolean {
  void record; void now;
  return false;
}

export function firstNameFromCustomerName(name: string): string {
  const part = String(name ?? "")
    .trim()
    .split(/\s+/)[0];
  return part || "there";
}
