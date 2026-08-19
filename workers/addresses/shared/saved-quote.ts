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

export function firstNameFromCustomerName(name: string): string {
  const part = String(name ?? "")
    .trim()
    .split(/\s+/)[0];
  return part || "there";
}
