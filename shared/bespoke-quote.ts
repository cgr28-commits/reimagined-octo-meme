/**
 * Bespoke (manually priced) quote requests — Event Transfers and Business Class
 * bespoke requests.
 *
 * Isolated from the instant airport calculator: nothing here prices a journey.
 * The owner enters every amount by hand. The authoritative record lives in the
 * BespokeQuoteCoordinator Durable Object (one object per request), so every
 * status change below is applied atomically there.
 *
 * Payment rules (owner-approved, Phase 0):
 * - A payment is ALWAYS recorded, whatever the status.
 * - Payment after expiry, cancellation, decline or loss of vehicle availability
 *   is never auto-confirmed: it is flagged for owner review.
 * - Nothing here issues refunds. "Refund required" is a manual owner step.
 */

import { BUSINESS_CLASS_MAX_PASSENGERS } from "./passenger-limits";
import { emailAddressProblem } from "./email-typo";
import { parseLondonLocalDateTime, todayLondonDate } from "./uk-time";

export const BESPOKE_QUOTE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Categories and service types
// ---------------------------------------------------------------------------

export const BESPOKE_QUOTE_CATEGORIES = ["event", "business_class"] as const;
export type BespokeQuoteCategory = (typeof BESPOKE_QUOTE_CATEGORIES)[number];

export const BESPOKE_QUOTE_CATEGORY_LABELS: Record<BespokeQuoteCategory, string> = {
  event: "Event Transfer",
  business_class: "Business Class Transfer",
};

export const BUSINESS_CLASS_REQUEST_SERVICE_TYPES = [
  "executive_airport",
  "corporate",
  "vip",
  "special_occasion",
  "bespoke_private",
] as const;
export type BusinessClassRequestServiceType = (typeof BUSINESS_CLASS_REQUEST_SERVICE_TYPES)[number];

export const BUSINESS_CLASS_REQUEST_SERVICE_LABELS: Record<BusinessClassRequestServiceType, string> = {
  executive_airport: "Executive airport transfer",
  corporate: "Corporate travel",
  vip: "VIP transfer",
  special_occasion: "Special occasion",
  bespoke_private: "Bespoke private journey",
};

/**
 * Passenger ceilings for REQUESTS (not instant quotes).
 * Business Class reuses the existing 3-passenger limit. Event groups above 7
 * may need more than one vehicle; the owner decides — nothing is promised.
 */
export const BESPOKE_QUOTE_MAX_PASSENGERS: Record<BespokeQuoteCategory, number> = {
  event: 16,
  business_class: BUSINESS_CLASS_MAX_PASSENGERS,
};

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const BESPOKE_QUOTE_STATUSES = [
  "NEW",
  "REVIEWING",
  "QUOTED",
  "PAYMENT_STARTED",
  /** Valid payment received; booking not yet created (Phase 3 creates it). */
  "PAID",
  /** Paid AND booking created. */
  "CONFIRMED",
  /** A payment arrived that must not be auto-confirmed. Owner decides. */
  "PAYMENT_REVIEW",
  /** Owner decided the payment must be refunded (manual step). */
  "REFUND_REQUIRED",
  "DECLINED",
  "CUSTOMER_DECLINED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type BespokeQuoteStatus = (typeof BESPOKE_QUOTE_STATUSES)[number];

export const BESPOKE_QUOTE_OWNER_STATUS_LABELS: Record<BespokeQuoteStatus, string> = {
  NEW: "New",
  REVIEWING: "Checking availability",
  QUOTED: "Quoted — awaiting payment",
  PAYMENT_STARTED: "Customer at checkout",
  PAID: "Paid — booking to be created",
  CONFIRMED: "Confirmed",
  PAYMENT_REVIEW: "Payment needs review",
  REFUND_REQUIRED: "Manual refund required",
  DECLINED: "Declined by us",
  CUSTOMER_DECLINED: "Declined by customer",
  EXPIRED: "Quote expired",
  CANCELLED: "Cancelled",
};

/** Customer wording. Never mentions internal review reasons. */
export const BESPOKE_QUOTE_PUBLIC_STATUS_LABELS: Record<BespokeQuoteStatus, string> = {
  NEW: "Request received",
  REVIEWING: "We are checking availability",
  QUOTED: "Quotation ready",
  PAYMENT_STARTED: "Payment in progress",
  PAID: "Payment received — confirming your booking",
  CONFIRMED: "Booking confirmed",
  PAYMENT_REVIEW: "Payment received — we will be in touch",
  REFUND_REQUIRED: "We will be in touch about your payment",
  DECLINED: "We are unable to quote for this journey",
  CUSTOMER_DECLINED: "Quotation declined",
  EXPIRED: "Quotation expired",
  CANCELLED: "Request cancelled",
};

export const BESPOKE_PAYMENT_REVIEW_REASONS = [
  "paid_after_expiry",
  "paid_after_cancellation",
  "vehicle_unavailable",
  "amount_mismatch",
  "unexpected_checkout",
  "duplicate_payment",
  "payment_during_review",
] as const;
export type BespokePaymentReviewReason = (typeof BESPOKE_PAYMENT_REVIEW_REASONS)[number];

export const BESPOKE_PAYMENT_REVIEW_REASON_LABELS: Record<BespokePaymentReviewReason, string> = {
  paid_after_expiry: "Paid after the quotation expired",
  paid_after_cancellation: "Paid after the request was cancelled or declined",
  vehicle_unavailable: "Paid while vehicle/driver marked unavailable",
  amount_mismatch: "Amount paid differs from the quoted amount",
  unexpected_checkout: "Payment does not match the current checkout",
  duplicate_payment: "Second payment for an already paid request",
  payment_during_review: "Further payment while a review was open",
};

export type BespokeAvailability = "unknown" | "checking" | "available" | "unavailable";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const BESPOKE_QUOTE_MIN_AMOUNT_GBP = 1;
export const BESPOKE_QUOTE_MAX_AMOUNT_GBP = 10_000;
export const BESPOKE_QUOTE_MIN_VALIDITY_HOURS = 1;
/** Two weeks. Owner can re-issue after expiry. */
export const BESPOKE_QUOTE_MAX_VALIDITY_HOURS = 24 * 14;
export const BESPOKE_QUOTE_VALIDITY_PRESETS_HOURS = [24, 48, 168] as const;
/** How long one checkout attempt blocks re-pricing / a second checkout. */
export const BESPOKE_PAYMENT_ATTEMPT_TTL_MINUTES = 30;
/** Requests can be made up to ~18 months ahead (major concerts sell early). */
export const BESPOKE_REQUEST_MAX_DAYS_AHEAD = 550;
export const BESPOKE_MAX_ADDITIONAL_STOPS = 3;
const HISTORY_LIMIT = 100;

const TEXT_LIMITS = {
  name: 100,
  email: 254,
  phone: 30,
  address: 300,
  stop: 200,
  luggage: 300,
  requirements: 1000,
  flight: 10,
  eventTitle: 200,
  venue: 200,
  eventId: 120,
  termsVersion: 40,
  ownerNote: 1000,
  customerMessage: 1000,
  driverName: 80,
  vehicleNote: 200,
  reference: 80,
} as const;

// ---------------------------------------------------------------------------
// Record shape
// ---------------------------------------------------------------------------

export type BespokeQuoteJourney = {
  pickupAddress: string;
  pickupPlaceId?: string;
  destinationAddress: string;
  destinationPlaceId?: string;
  /** Europe/London YYYY-MM-DD */
  date: string;
  /** Europe/London HH:MM */
  time: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  luggage?: string;
  additionalStops: string[];
  flightNumber?: string;
  /** Customer asked for a group / 7-seater. Subject to availability — never promised. */
  groupVehicleRequested: boolean;
  specialRequirements?: string;
};

export type BespokeQuoteEventInfo = {
  /** Approved event id (validated against the Events store from Phase 5). */
  eventId?: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  venue: string;
};

export type BespokeQuoteCustomer = {
  name: string;
  email: string;
  phone: string;
};

export type BespokeQuoteConsent = {
  termsAcceptedAt: string;
  termsVersion: string;
  privacyAcknowledged: true;
};

export type BespokeQuoteOwnerFields = {
  availability: BespokeAvailability;
  availabilityNote?: string;
  driverName?: string;
  vehicleNote?: string;
  /** PRIVATE — never in public projections. */
  estimatedDriverCostGbp?: number;
  /** PRIVATE — never in public projections. */
  estimatedOtherCostsGbp?: number;
  /** PRIVATE — never in public projections. */
  internalNotes?: string;
};

export type BespokeQuoteOffer = {
  version: number;
  amountGbp: number;
  issuedAt: string;
  expiresAt: string;
  customerMessage?: string;
  /** SHA-256 (hex) of the customer link secret. The secret itself is never stored. */
  tokenHash: string;
};

export type BespokePaymentAttempt = {
  attemptId: string;
  quoteVersion: number;
  amountGbp: number;
  startedAt: string;
  expiresAt: string;
  checkoutId?: string;
};

export type BespokePaymentEntry = {
  paymentReference: string;
  checkoutId?: string;
  amountGbp: number;
  recordedAt: string;
  quoteVersion?: number;
  outcome: "accepted" | "review";
  reviewReasons?: BespokePaymentReviewReason[];
  refundedManuallyAt?: string;
  refundNote?: string;
};

export type BespokeReview = {
  open: boolean;
  reasons: BespokePaymentReviewReason[];
  openedAt: string;
  resolvedAt?: string;
  resolution?: "accept_payment" | "manual_refund_required";
  note?: string;
};

export type BespokeHistoryEntry = {
  at: string;
  actor: "customer" | "owner" | "system";
  action: string;
  fromStatus: BespokeQuoteStatus;
  toStatus: BespokeQuoteStatus;
  note?: string;
};

export type BespokeQuoteRecord = {
  schemaVersion: typeof BESPOKE_QUOTE_SCHEMA_VERSION;
  reference: string;
  category: BespokeQuoteCategory;
  status: BespokeQuoteStatus;
  /** Increments on every change — optimistic concurrency for owner edits. */
  version: number;
  createdAt: string;
  updatedAt: string;
  customer: BespokeQuoteCustomer;
  journey: BespokeQuoteJourney;
  serviceType?: BusinessClassRequestServiceType;
  event?: BespokeQuoteEventInfo;
  consent: BespokeQuoteConsent;
  owner: BespokeQuoteOwnerFields;
  quote?: BespokeQuoteOffer;
  quoteHistory: Array<Pick<BespokeQuoteOffer, "version" | "amountGbp" | "issuedAt" | "expiresAt">>;
  paymentAttempt?: BespokePaymentAttempt;
  payments: BespokePaymentEntry[];
  review?: BespokeReview;
  bookingReference?: string;
  history: BespokeHistoryEntry[];
  dedupeFingerprint: string;
};

// ---------------------------------------------------------------------------
// Input validation (server-side; the browser form mirrors these rules)
// ---------------------------------------------------------------------------

export type BespokeQuoteRequestInput = Record<string, unknown>;

export type ValidatedBespokeQuoteRequest = {
  category: BespokeQuoteCategory;
  customer: BespokeQuoteCustomer;
  journey: BespokeQuoteJourney;
  serviceType?: BusinessClassRequestServiceType;
  event?: BespokeQuoteEventInfo;
  consent: BespokeQuoteConsent;
};

export type BespokeValidationResult =
  | { ok: true; value: ValidatedBespokeQuoteRequest }
  | { ok: false; errors: Record<string, string> };

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trim, drop control characters, collapse runs of spaces. Returns "" for non-strings. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_CHARS, "").replace(/[ \t]+/g, " ").trim();
  return cleaned.length > maxLength ? "\u0000TOO_LONG" : cleaned;
}

function isTooLong(value: string): boolean {
  return value === "\u0000TOO_LONG";
}

export function isPlausiblePhone(value: string): boolean {
  if (!/^[+\d][\d\s()-]*$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  if (digits.startsWith("44")) return digits.length >= 12;
  return true;
}

const FLIGHT_NUMBER = /^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EVENT_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
const PLACE_ID = /^[A-Za-z0-9_:.-]{1,300}$/;

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isRealDate(date: string): boolean {
  if (!DATE.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

function readBool(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

function readInt(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}

/**
 * Validate and normalise a public request. Unknown fields are ignored.
 * `now` is injectable for tests.
 */
export function validateBespokeQuoteRequest(
  input: BespokeQuoteRequestInput,
  now = new Date(),
): BespokeValidationResult {
  const errors: Record<string, string> = {};
  const category = input.category;
  if (category !== "event" && category !== "business_class") {
    return { ok: false, errors: { category: "Choose Event Transfer or Business Class." } };
  }

  const text = (field: string, max: number, required: boolean, label: string): string => {
    const value = cleanText(input[field], max);
    if (isTooLong(value)) {
      errors[field] = `${label} is too long (maximum ${max} characters).`;
      return "";
    }
    if (required && !value) errors[field] = `${label} is required.`;
    return value;
  };

  // Customer
  const name = text("customerName", TEXT_LIMITS.name, true, "Your name");
  if (name && name.length < 2) errors.customerName = "Please enter your full name.";
  const email = text("customerEmail", TEXT_LIMITS.email, true, "Email address");
  if (email) {
    const problem = emailAddressProblem(email);
    if (problem) errors.customerEmail = problem;
  }
  const phone = text("customerPhone", TEXT_LIMITS.phone, true, "Telephone number");
  if (phone && !isPlausiblePhone(phone)) errors.customerPhone = "Please enter a valid telephone number.";

  // Journey
  const pickupAddress = text("pickupAddress", TEXT_LIMITS.address, true, "Pickup address");
  if (pickupAddress && pickupAddress.length < 5) errors.pickupAddress = "Please enter the full pickup address.";
  const destinationAddress = text("destinationAddress", TEXT_LIMITS.address, true, "Destination");
  if (destinationAddress && destinationAddress.length < 3) {
    errors.destinationAddress = "Please enter the destination.";
  }
  const pickupPlaceId = cleanText(input.pickupPlaceId, 300);
  const destinationPlaceId = cleanText(input.destinationPlaceId, 300);

  const today = todayLondonDate(now);
  const latest = addDaysIso(today, BESPOKE_REQUEST_MAX_DAYS_AHEAD);
  const date = text("date", 10, true, "Date");
  const time = text("time", 5, true, "Time");
  if (date && !isRealDate(date)) errors.date = "Enter a valid date.";
  else if (date && (date < today || date > latest)) errors.date = "Choose a date between today and 18 months ahead.";
  if (time && !TIME.test(time)) errors.time = "Enter a valid time (HH:MM).";
  let outboundAt: Date | null = null;
  if (!errors.date && !errors.time && date && time) {
    outboundAt = parseLondonLocalDateTime(date, time);
    if (!outboundAt) errors.time = "Enter a valid time (HH:MM).";
    else if (outboundAt.getTime() <= now.getTime()) errors.time = "The pickup time must be in the future.";
  }

  const returnJourney = readBool(input.returnJourney);
  let returnDate: string | undefined;
  let returnTime: string | undefined;
  if (returnJourney) {
    returnDate = text("returnDate", 10, true, "Return date") || undefined;
    returnTime = text("returnTime", 5, true, "Return time") || undefined;
    if (returnDate && !isRealDate(returnDate)) errors.returnDate = "Enter a valid return date.";
    else if (returnDate && returnDate > latest) errors.returnDate = "Return date is too far ahead.";
    if (returnTime && !TIME.test(returnTime)) errors.returnTime = "Enter a valid return time (HH:MM).";
    if (!errors.returnDate && !errors.returnTime && returnDate && returnTime && outboundAt) {
      const back = parseLondonLocalDateTime(returnDate, returnTime);
      if (!back || back.getTime() <= outboundAt.getTime()) {
        errors.returnTime = "The return must be after the outward journey.";
      }
    }
  }

  const max = BESPOKE_QUOTE_MAX_PASSENGERS[category];
  const passengers = readInt(input.passengers);
  if (passengers === null || passengers < 1) errors.passengers = "Enter the number of passengers.";
  else if (passengers > max) {
    errors.passengers =
      category === "business_class"
        ? `Business Class accommodates up to ${max} passengers.`
        : `For groups larger than ${max}, please contact us directly.`;
  }

  const luggage = text("luggage", TEXT_LIMITS.luggage, false, "Luggage details");
  const specialRequirements = text("specialRequirements", TEXT_LIMITS.requirements, false, "Additional requirements");

  const additionalStops: string[] = [];
  if (input.additionalStops !== undefined && input.additionalStops !== null) {
    if (!Array.isArray(input.additionalStops)) errors.additionalStops = "Additional stops are invalid.";
    else {
      if (input.additionalStops.length > BESPOKE_MAX_ADDITIONAL_STOPS) {
        errors.additionalStops = `Up to ${BESPOKE_MAX_ADDITIONAL_STOPS} additional stops.`;
      }
      for (const stop of input.additionalStops.slice(0, BESPOKE_MAX_ADDITIONAL_STOPS)) {
        const s = cleanText(stop, TEXT_LIMITS.stop);
        if (isTooLong(s)) errors.additionalStops = "An additional stop is too long.";
        else if (s) additionalStops.push(s);
      }
    }
  }

  let flightNumber: string | undefined;
  const rawFlight = text("flightNumber", TEXT_LIMITS.flight, false, "Flight number").toUpperCase();
  if (rawFlight) {
    if (!FLIGHT_NUMBER.test(rawFlight)) errors.flightNumber = "Enter a valid flight number, e.g. EZY1234.";
    else flightNumber = rawFlight.replace(/\s+/g, "");
  }

  const groupVehicleRequested = category === "event" ? readBool(input.groupVehicleRequested) : false;

  // Category specifics
  let serviceType: BusinessClassRequestServiceType | undefined;
  let event: BespokeQuoteEventInfo | undefined;
  if (category === "business_class") {
    const st = input.serviceType;
    if (typeof st !== "string" || !(BUSINESS_CLASS_REQUEST_SERVICE_TYPES as readonly string[]).includes(st)) {
      errors.serviceType = "Choose a service type.";
    } else serviceType = st as BusinessClassRequestServiceType;
  } else {
    const title = text("eventTitle", TEXT_LIMITS.eventTitle, true, "Event");
    const venue = text("eventVenue", TEXT_LIMITS.venue, true, "Venue");
    const eventDate = text("eventDate", 10, true, "Event date");
    if (eventDate && !isRealDate(eventDate)) errors.eventDate = "Enter a valid event date.";
    else if (eventDate && eventDate < today) errors.eventDate = "This event has already taken place.";
    const eventIdRaw = cleanText(input.eventId, TEXT_LIMITS.eventId);
    if (eventIdRaw && (isTooLong(eventIdRaw) || !EVENT_ID.test(eventIdRaw))) errors.eventId = "Event reference is invalid.";
    if (title && venue && eventDate) {
      event = { title, venue, date: eventDate, ...(eventIdRaw && !errors.eventId ? { eventId: eventIdRaw } : {}) };
    }
  }

  // Consent
  if (!readBool(input.termsAccepted)) errors.termsAccepted = "Please accept the terms to continue.";
  if (!readBool(input.privacyAcknowledged)) {
    errors.privacyAcknowledged = "Please confirm you have read the privacy notice.";
  }
  const termsVersion = cleanText(input.termsVersion, TEXT_LIMITS.termsVersion);
  if (!termsVersion || isTooLong(termsVersion)) errors.termsVersion = "Terms version is missing.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      category,
      customer: { name, email: email.toLowerCase(), phone },
      journey: {
        pickupAddress,
        ...(pickupPlaceId && !isTooLong(pickupPlaceId) && PLACE_ID.test(pickupPlaceId) ? { pickupPlaceId } : {}),
        destinationAddress,
        ...(destinationPlaceId && !isTooLong(destinationPlaceId) && PLACE_ID.test(destinationPlaceId)
          ? { destinationPlaceId }
          : {}),
        date,
        time,
        returnJourney,
        ...(returnJourney ? { returnDate, returnTime } : {}),
        passengers: passengers as number,
        ...(luggage ? { luggage } : {}),
        additionalStops,
        ...(flightNumber ? { flightNumber } : {}),
        groupVehicleRequested,
        ...(specialRequirements ? { specialRequirements } : {}),
      },
      ...(serviceType ? { serviceType } : {}),
      ...(event ? { event } : {}),
      consent: { termsAcceptedAt: now.toISOString(), termsVersion, privacyAcknowledged: true },
    },
  };
}

// ---------------------------------------------------------------------------
// References, tokens, fingerprints
// ---------------------------------------------------------------------------

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateBespokeQuoteReference(now = new Date()): string {
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = Array.from(randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
  return `MATNI-BQ-${ymd}-${suffix}`;
}

export function isBespokeQuoteReference(value: unknown): value is string {
  return typeof value === "string" && /^MATNI-BQ-\d{6}-[A-HJ-NP-Z2-9]{6}$/.test(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

/**
 * Customer link token: "<reference>.<64 hex secret>".
 * The reference routes to the right Durable Object; only the SHA-256 of the
 * secret is stored. Links put the token after "#" so it never reaches
 * static-hosting logs or Referer headers.
 */
export async function generateBespokeCustomerToken(reference: string): Promise<{ token: string; tokenHash: string }> {
  const secret = toHex(randomBytes(32));
  return { token: `${reference}.${secret}`, tokenHash: await sha256Hex(secret) };
}

export function parseBespokeCustomerToken(token: unknown): { reference: string; secret: string } | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const match = /^(MATNI-BQ-\d{6}-[A-HJ-NP-Z2-9]{6})\.([0-9a-f]{64})$/.exec(token.trim());
  return match ? { reference: match[1], secret: match[2] } : null;
}

/** Constant-time comparison of two hex strings of equal length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Same customer + same trip within the dedupe window → same request. */
export async function bespokeQuoteFingerprint(value: ValidatedBespokeQuoteRequest): Promise<string> {
  const parts = [
    value.category,
    value.customer.email.toLowerCase(),
    value.event?.eventId ?? value.event?.title.toLowerCase() ?? value.serviceType ?? "",
    value.journey.date,
    value.journey.pickupAddress.toLowerCase(),
  ];
  return sha256Hex(parts.join("|"));
}

export function createBespokeQuoteRecord(input: {
  reference: string;
  request: ValidatedBespokeQuoteRequest;
  fingerprint: string;
  now?: Date;
}): BespokeQuoteRecord {
  const at = (input.now ?? new Date()).toISOString();
  const r = input.request;
  return {
    schemaVersion: BESPOKE_QUOTE_SCHEMA_VERSION,
    reference: input.reference,
    category: r.category,
    status: "NEW",
    version: 1,
    createdAt: at,
    updatedAt: at,
    customer: r.customer,
    journey: r.journey,
    ...(r.serviceType ? { serviceType: r.serviceType } : {}),
    ...(r.event ? { event: r.event } : {}),
    consent: r.consent,
    owner: { availability: "unknown" },
    quoteHistory: [],
    payments: [],
    history: [{ at, actor: "customer", action: "request_submitted", fromStatus: "NEW", toStatus: "NEW" }],
    dedupeFingerprint: input.fingerprint,
  };
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type BespokeQuoteAction =
  | { type: "owner_start_review" }
  | {
      type: "owner_update_availability";
      availability: BespokeAvailability;
      availabilityNote?: string;
      driverName?: string;
      vehicleNote?: string;
    }
  | {
      type: "owner_set_costs";
      estimatedDriverCostGbp?: number | null;
      estimatedOtherCostsGbp?: number | null;
      internalNotes?: string;
    }
  | {
      type: "owner_issue_quote";
      amountGbp: number;
      validityHours: number;
      customerMessage?: string;
      /** Computed server-side from a fresh secret; never supplied by a browser. */
      tokenHash: string;
    }
  | {
      /** Replace the customer link (e.g. resend after a failed email). Same price, same version. */
      type: "owner_rotate_link";
      tokenHash: string;
    }
  | { type: "owner_decline"; note?: string }
  | { type: "owner_cancel"; note?: string }
  | { type: "owner_resolve_review"; resolution: "accept_payment" | "manual_refund_required"; note: string }
  | { type: "owner_record_manual_refund"; paymentReference: string; note: string }
  | { type: "customer_decline"; tokenHash: string }
  | { type: "system_expire" }
  | { type: "system_begin_payment"; quoteVersion: number; attemptId: string; tokenHash: string }
  | { type: "system_attach_checkout"; attemptId: string; checkoutId: string }
  | { type: "system_release_payment_attempt"; attemptId: string; reason: string }
  | { type: "system_record_payment"; paymentReference: string; checkoutId?: string; amountGbp: number }
  | { type: "system_mark_booked"; bookingReference: string };

export type BespokeTransitionResult =
  | { ok: true; record: BespokeQuoteRecord; changed: boolean; outcome?: string }
  | { ok: false; code: string; error: string; status: number };

const OWNER_EDITABLE: readonly BespokeQuoteStatus[] = ["NEW", "REVIEWING", "QUOTED", "EXPIRED", "CUSTOMER_DECLINED"];
const QUOTE_ISSUABLE: readonly BespokeQuoteStatus[] = ["NEW", "REVIEWING", "QUOTED", "EXPIRED", "CUSTOMER_DECLINED"];
const CANCELLABLE: readonly BespokeQuoteStatus[] = [
  "NEW",
  "REVIEWING",
  "QUOTED",
  "PAYMENT_STARTED",
  "EXPIRED",
  "CUSTOMER_DECLINED",
];

function fail(code: string, error: string, status = 409): BespokeTransitionResult {
  return { ok: false, code, error, status };
}

function money(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return Math.abs(rounded - value) < 1e-9 ? rounded : null;
}

function note(value: unknown, max: number = TEXT_LIMITS.ownerNote): string | undefined {
  const cleaned = cleanText(value, max);
  if (isTooLong(cleaned)) return undefined;
  return cleaned || undefined;
}

function isTooLongInput(value: unknown, max: number): boolean {
  return isTooLong(cleanText(value, max));
}

export function isBespokeQuoteExpired(record: BespokeQuoteRecord, now: Date): boolean {
  return Boolean(record.quote && Date.parse(record.quote.expiresAt) <= now.getTime());
}

/** Owner-entered profit estimate. Owner-only. */
export function bespokeEstimatedProfitGbp(record: BespokeQuoteRecord): number | null {
  if (!record.quote) return null;
  const costs = (record.owner.estimatedDriverCostGbp ?? 0) + (record.owner.estimatedOtherCostsGbp ?? 0);
  if (record.owner.estimatedDriverCostGbp === undefined && record.owner.estimatedOtherCostsGbp === undefined) {
    return null;
  }
  return Math.round((record.quote.amountGbp - costs) * 100) / 100;
}

function pickupInstant(record: BespokeQuoteRecord): Date | null {
  return parseLondonLocalDateTime(record.journey.date, record.journey.time);
}

/**
 * Pure transition. Returns a NEW record (never mutates the input).
 * The Durable Object is the only caller that persists the result.
 */
export function applyBespokeQuoteAction(
  current: BespokeQuoteRecord,
  action: BespokeQuoteAction,
  now: Date,
): BespokeTransitionResult {
  const record: BespokeQuoteRecord = structuredClone(current);
  const at = now.toISOString();
  const from = record.status;
  const commit = (
    actor: BespokeHistoryEntry["actor"],
    toStatus: BespokeQuoteStatus,
    historyNote?: string,
    outcome?: string,
  ): BespokeTransitionResult => {
    record.status = toStatus;
    record.version += 1;
    record.updatedAt = at;
    record.history = [
      ...record.history,
      { at, actor, action: action.type, fromStatus: from, toStatus, ...(historyNote ? { note: historyNote } : {}) },
    ].slice(-HISTORY_LIMIT);
    return { ok: true, record, changed: true, ...(outcome ? { outcome } : {}) };
  };
  const unchanged = (outcome: string): BespokeTransitionResult => ({ ok: true, record: current, changed: false, outcome });

  switch (action.type) {
    case "owner_start_review": {
      if (from !== "NEW") return fail("invalid_status", "Only new requests can be moved to review.");
      record.owner.availability = record.owner.availability === "unknown" ? "checking" : record.owner.availability;
      return commit("owner", "REVIEWING");
    }

    case "owner_update_availability": {
      const allowed: BespokeAvailability[] = ["unknown", "checking", "available", "unavailable"];
      if (!allowed.includes(action.availability)) return fail("invalid_input", "Choose an availability status.", 400);
      if (
        isTooLongInput(action.availabilityNote, TEXT_LIMITS.ownerNote) ||
        isTooLongInput(action.driverName, TEXT_LIMITS.driverName) ||
        isTooLongInput(action.vehicleNote, TEXT_LIMITS.vehicleNote)
      ) {
        return fail("invalid_input", "A note is too long.", 400);
      }
      record.owner = {
        ...record.owner,
        availability: action.availability,
        availabilityNote: note(action.availabilityNote),
        driverName: note(action.driverName, TEXT_LIMITS.driverName),
        vehicleNote: note(action.vehicleNote, TEXT_LIMITS.vehicleNote),
      };
      return commit("owner", from, `availability: ${action.availability}`);
    }

    case "owner_set_costs": {
      const driver = action.estimatedDriverCostGbp == null ? undefined : money(action.estimatedDriverCostGbp);
      const other = action.estimatedOtherCostsGbp == null ? undefined : money(action.estimatedOtherCostsGbp);
      if (driver === null || other === null || (driver ?? 0) < 0 || (other ?? 0) < 0 ||
        (driver ?? 0) > BESPOKE_QUOTE_MAX_AMOUNT_GBP || (other ?? 0) > BESPOKE_QUOTE_MAX_AMOUNT_GBP) {
        return fail("invalid_input", "Costs must be amounts in pounds and pence.", 400);
      }
      if (isTooLongInput(action.internalNotes, TEXT_LIMITS.ownerNote)) return fail("invalid_input", "Notes are too long.", 400);
      record.owner = {
        ...record.owner,
        estimatedDriverCostGbp: driver,
        estimatedOtherCostsGbp: other,
        internalNotes: note(action.internalNotes),
      };
      return commit("owner", from);
    }

    case "owner_issue_quote": {
      if (!QUOTE_ISSUABLE.includes(from)) {
        return fail(
          "invalid_status",
          from === "PAYMENT_STARTED"
            ? "The customer is at checkout. Wait for the payment to finish or be released before re-quoting."
            : "A quotation cannot be issued in the current status.",
        );
      }
      if (record.owner.availability === "unavailable") {
        return fail("unavailable", "Availability is marked unavailable. Update it before quoting.");
      }
      const amount = money(action.amountGbp);
      if (amount === null || amount < BESPOKE_QUOTE_MIN_AMOUNT_GBP || amount > BESPOKE_QUOTE_MAX_AMOUNT_GBP) {
        return fail("invalid_input", `Enter a price between £${BESPOKE_QUOTE_MIN_AMOUNT_GBP} and £${BESPOKE_QUOTE_MAX_AMOUNT_GBP}.`, 400);
      }
      const hours = action.validityHours;
      if (!Number.isInteger(hours) || hours < BESPOKE_QUOTE_MIN_VALIDITY_HOURS || hours > BESPOKE_QUOTE_MAX_VALIDITY_HOURS) {
        return fail("invalid_input", "Validity must be between 1 hour and 14 days.", 400);
      }
      if (!/^[0-9a-f]{64}$/.test(action.tokenHash)) return fail("invalid_input", "Token is invalid.", 400);
      if (isTooLongInput(action.customerMessage, TEXT_LIMITS.customerMessage)) {
        return fail("invalid_input", "The customer message is too long.", 400);
      }
      const pickup = pickupInstant(record);
      if (!pickup || pickup.getTime() <= now.getTime()) {
        return fail("pickup_passed", "The pickup time has passed. This request can no longer be quoted.");
      }
      // A quote must never be payable after the pickup time.
      const expiresMs = Math.min(now.getTime() + hours * 3_600_000, pickup.getTime());
      const version = (record.quote?.version ?? 0) + 1;
      const offer: BespokeQuoteOffer = {
        version,
        amountGbp: amount,
        issuedAt: at,
        expiresAt: new Date(expiresMs).toISOString(),
        customerMessage: note(action.customerMessage, TEXT_LIMITS.customerMessage),
        tokenHash: action.tokenHash,
      };
      record.quote = offer;
      record.quoteHistory = [
        ...record.quoteHistory,
        { version, amountGbp: amount, issuedAt: at, expiresAt: offer.expiresAt },
      ];
      delete record.paymentAttempt;
      return commit("owner", "QUOTED", `quote v${version}: £${amount.toFixed(2)}`);
    }

    case "owner_rotate_link": {
      if (from !== "QUOTED" || !record.quote) {
        return fail("invalid_status", "A new link can only be sent while the quotation is open.");
      }
      if (isBespokeQuoteExpired(record, now)) return fail("expired", "This quotation has expired. Issue a new one.");
      if (!/^[0-9a-f]{64}$/.test(action.tokenHash)) return fail("invalid_input", "Token is invalid.", 400);
      // The previous link stops working; only the newest emailed link is valid.
      record.quote = { ...record.quote, tokenHash: action.tokenHash };
      return commit("owner", from, "customer link replaced");
    }

    case "owner_decline":
    case "owner_cancel": {
      if (!CANCELLABLE.includes(from) || (action.type === "owner_decline" && from === "PAYMENT_STARTED")) {
        return fail(
          "invalid_status",
          ["PAID", "CONFIRMED", "PAYMENT_REVIEW", "REFUND_REQUIRED"].includes(from)
            ? "Money has been received for this request. Resolve the payment first."
            : "This request cannot be changed in its current status.",
        );
      }
      if (isTooLongInput(action.note, TEXT_LIMITS.ownerNote)) return fail("invalid_input", "Note is too long.", 400);
      // Cancelling while at checkout is allowed: if that payment still lands it is
      // recorded and flagged for review ("paid_after_cancellation").
      return commit("owner", action.type === "owner_decline" ? "DECLINED" : "CANCELLED", note(action.note));
    }

    case "customer_decline": {
      if (from !== "QUOTED" || !record.quote) return fail("invalid_status", "This quotation can no longer be declined.");
      if (!timingSafeEqualHex(record.quote.tokenHash, action.tokenHash)) {
        return fail("not_found", "This quotation link is invalid or no longer available.", 404);
      }
      if (isBespokeQuoteExpired(record, now)) return fail("expired", "This quotation has expired.");
      return commit("customer", "CUSTOMER_DECLINED");
    }

    case "system_expire": {
      if (from === "QUOTED" && isBespokeQuoteExpired(record, now)) return commit("system", "EXPIRED");
      if (from === "PAYMENT_STARTED" && record.paymentAttempt && Date.parse(record.paymentAttempt.expiresAt) <= now.getTime()) {
        // We cannot know whether the abandoned checkout was paid. Phase 3 checks
        // the provider, then records the payment or releases the attempt.
        return unchanged("needs_provider_check");
      }
      return unchanged("not_due");
    }

    case "system_begin_payment": {
      if (!record.quote || !timingSafeEqualHex(record.quote.tokenHash, action.tokenHash)) {
        return fail("not_found", "This quotation link is invalid or no longer available.", 404);
      }
      if (from === "PAYMENT_STARTED" && record.paymentAttempt) {
        const attempt = record.paymentAttempt;
        if (attempt.quoteVersion === action.quoteVersion && Date.parse(attempt.expiresAt) > now.getTime()) {
          // Idempotent: hand back the SAME attempt so only one checkout exists.
          return unchanged("existing_attempt");
        }
        return fail(
          "payment_in_progress",
          "A payment for this quotation is already in progress. Please wait a few minutes before trying again, and do not pay twice.",
        );
      }
      if (from !== "QUOTED") return fail("invalid_status", "This quotation is not available for payment.");
      if (record.quote.version !== action.quoteVersion) {
        return fail("stale_quote", "This quotation has been updated. Please reopen the latest link.");
      }
      if (isBespokeQuoteExpired(record, now)) return fail("expired", "This quotation has expired.");
      if (record.owner.availability === "unavailable") {
        return fail("unavailable", "This quotation is temporarily unavailable. Please contact us.");
      }
      if (!/^[A-Za-z0-9-]{8,80}$/.test(action.attemptId)) return fail("invalid_input", "Invalid attempt.", 400);
      record.paymentAttempt = {
        attemptId: action.attemptId,
        quoteVersion: record.quote.version,
        amountGbp: record.quote.amountGbp,
        startedAt: at,
        expiresAt: new Date(now.getTime() + BESPOKE_PAYMENT_ATTEMPT_TTL_MINUTES * 60_000).toISOString(),
      };
      return commit("customer", "PAYMENT_STARTED", undefined, "new_attempt");
    }

    case "system_attach_checkout": {
      const attempt = record.paymentAttempt;
      if (!attempt || attempt.attemptId !== action.attemptId) return fail("attempt_mismatch", "Payment attempt not found.");
      if (!/^[A-Za-z0-9_-]{4,200}$/.test(action.checkoutId)) return fail("invalid_input", "Invalid checkout id.", 400);
      if (attempt.checkoutId === action.checkoutId) return unchanged("already_attached");
      if (attempt.checkoutId) return fail("checkout_conflict", "A different checkout is already attached.");
      attempt.checkoutId = action.checkoutId;
      return commit("system", from);
    }

    case "system_release_payment_attempt": {
      const attempt = record.paymentAttempt;
      if (from !== "PAYMENT_STARTED" || !attempt || attempt.attemptId !== action.attemptId) {
        return unchanged("nothing_to_release");
      }
      if (attempt.checkoutId && record.payments.some((p) => p.checkoutId === attempt.checkoutId)) {
        return fail("payment_recorded", "A payment is already recorded for this attempt.");
      }
      delete record.paymentAttempt;
      return commit("system", isBespokeQuoteExpired(record, now) ? "EXPIRED" : "QUOTED", note(action.reason, 200));
    }

    case "system_record_payment": {
      const paymentReference = cleanText(action.paymentReference, TEXT_LIMITS.reference);
      if (!paymentReference || isTooLong(paymentReference)) return fail("invalid_input", "Payment reference is required.", 400);
      const amount = money(action.amountGbp);
      if (amount === null || amount < 0) return fail("invalid_input", "Payment amount is invalid.", 400);
      if (record.payments.some((p) => p.paymentReference === paymentReference)) {
        return unchanged("duplicate_callback");
      }

      const reasons = new Set<BespokePaymentReviewReason>();
      const attempt = record.paymentAttempt;
      const alreadyPaid = record.payments.some((p) => p.outcome === "accepted" && !p.refundedManuallyAt);
      if (from === "PAID" || from === "CONFIRMED" || alreadyPaid) reasons.add("duplicate_payment");
      if (from === "PAYMENT_REVIEW" || from === "REFUND_REQUIRED") reasons.add("payment_during_review");
      if (from === "CANCELLED" || from === "DECLINED" || from === "CUSTOMER_DECLINED") {
        reasons.add("paid_after_cancellation");
      }
      if (from === "EXPIRED" || isBespokeQuoteExpired(record, now)) reasons.add("paid_after_expiry");
      if (!attempt || !action.checkoutId || attempt.checkoutId !== action.checkoutId) reasons.add("unexpected_checkout");
      const expected = attempt?.amountGbp ?? record.quote?.amountGbp;
      if (expected === undefined || Math.round(expected * 100) !== Math.round(amount * 100)) reasons.add("amount_mismatch");
      if (record.owner.availability === "unavailable") reasons.add("vehicle_unavailable");
      if (from !== "PAYMENT_STARTED" && reasons.size === 0) reasons.add("unexpected_checkout");

      const accepted = reasons.size === 0;
      const entry: BespokePaymentEntry = {
        paymentReference,
        ...(action.checkoutId ? { checkoutId: cleanText(action.checkoutId, 200) } : {}),
        amountGbp: amount,
        recordedAt: at,
        ...(record.quote ? { quoteVersion: attempt?.quoteVersion ?? record.quote.version } : {}),
        outcome: accepted ? "accepted" : "review",
        ...(accepted ? {} : { reviewReasons: [...reasons] }),
      };
      record.payments = [...record.payments, entry];

      if (accepted) return commit("system", "PAID", `payment ${paymentReference}`, "accepted");

      const prior = record.review?.open ? record.review.reasons : [];
      record.review = {
        open: true,
        reasons: [...new Set([...prior, ...reasons])],
        openedAt: record.review?.open ? record.review.openedAt : at,
      };
      // Never un-confirm a confirmed/paid job because of a duplicate payment:
      // keep the status and open a review on the side.
      const keepStatus = from === "PAID" || from === "CONFIRMED" || from === "REFUND_REQUIRED";
      return commit("system", keepStatus ? from : "PAYMENT_REVIEW", `payment ${paymentReference} needs review`, "review");
    }

    case "system_mark_booked": {
      const bookingReference = cleanText(action.bookingReference, TEXT_LIMITS.reference);
      if (!bookingReference || isTooLong(bookingReference)) return fail("invalid_input", "Booking reference is required.", 400);
      if (from === "CONFIRMED" && record.bookingReference === bookingReference) return unchanged("already_booked");
      if (from !== "PAID") return fail("invalid_status", "Only paid requests can be confirmed.");
      record.bookingReference = bookingReference;
      return commit("system", "CONFIRMED", bookingReference);
    }

    case "owner_resolve_review": {
      if (!record.review?.open) return fail("no_review", "There is no open payment review.");
      const resolutionNote = note(action.note);
      if (!resolutionNote) return fail("invalid_input", "Add a note explaining the decision.", 400);
      if (action.resolution !== "accept_payment" && action.resolution !== "manual_refund_required") {
        return fail("invalid_input", "Choose a resolution.", 400);
      }
      record.review = { ...record.review, open: false, resolvedAt: at, resolution: action.resolution, note: resolutionNote };
      if (from === "PAYMENT_REVIEW") {
        if (action.resolution === "accept_payment") {
          const pending = [...record.payments].reverse().find((p) => p.outcome === "review" && !p.refundedManuallyAt);
          if (pending) pending.outcome = "accepted";
          return commit("owner", "PAID", resolutionNote);
        }
        return commit("owner", "REFUND_REQUIRED", resolutionNote);
      }
      // PAID / CONFIRMED with a duplicate payment: status stays; the extra payment
      // stays marked "review" until a manual refund is recorded.
      return commit("owner", from, resolutionNote);
    }

    case "owner_record_manual_refund": {
      const payment = record.payments.find((p) => p.paymentReference === action.paymentReference);
      if (!payment) return fail("not_found", "Payment not found.", 404);
      if (payment.refundedManuallyAt) return unchanged("already_recorded");
      const refundNote = note(action.note);
      if (!refundNote) return fail("invalid_input", "Add the refund reference or a note.", 400);
      payment.refundedManuallyAt = at;
      payment.refundNote = refundNote;
      // REFUND_REQUIRED closes only when every payment on the request is refunded.
      const anyUnrefunded = record.payments.some((p) => !p.refundedManuallyAt);
      const toStatus = from === "REFUND_REQUIRED" && !anyUnrefunded ? "CANCELLED" : from;
      return commit("owner", toStatus, `manual refund recorded for ${payment.paymentReference}`);
    }

    default:
      return fail("unknown_action", "Unknown action.", 400);
  }
}

export function isBespokeOwnerAction(type: unknown): boolean {
  return typeof type === "string" && type.startsWith("owner_");
}

export function bespokeOwnerCanEdit(status: BespokeQuoteStatus): boolean {
  return OWNER_EDITABLE.includes(status);
}

// ---------------------------------------------------------------------------
// Projections — the ONLY shapes that leave the Worker
// ---------------------------------------------------------------------------

export type BespokeQuotePublicView = {
  reference: string;
  category: BespokeQuoteCategory;
  categoryLabel: string;
  status: BespokeQuoteStatus;
  statusLabel: string;
  customerFirstName: string;
  serviceTypeLabel?: string;
  event?: { title: string; date: string; venue: string };
  journey: {
    pickupAddress: string;
    destinationAddress: string;
    date: string;
    time: string;
    returnJourney: boolean;
    returnDate?: string;
    returnTime?: string;
    passengers: number;
    additionalStops: string[];
  };
  quote?: {
    version: number;
    amountGbp: number;
    expiresAt: string;
    customerMessage?: string;
    payable: boolean;
  };
};

/**
 * Customer view for a valid token holder. Whitelist only — never email, phone,
 * owner notes, availability notes, costs, profit, payments or review reasons.
 */
export function toBespokeQuotePublicView(record: BespokeQuoteRecord, now: Date): BespokeQuotePublicView {
  const showQuote = record.quote && ["QUOTED", "PAYMENT_STARTED", "PAID", "CONFIRMED"].includes(record.status);
  return {
    reference: record.reference,
    category: record.category,
    categoryLabel: BESPOKE_QUOTE_CATEGORY_LABELS[record.category],
    status: record.status,
    statusLabel: BESPOKE_QUOTE_PUBLIC_STATUS_LABELS[record.status],
    customerFirstName: record.customer.name.split(/\s+/)[0] ?? "",
    ...(record.serviceType ? { serviceTypeLabel: BUSINESS_CLASS_REQUEST_SERVICE_LABELS[record.serviceType] } : {}),
    ...(record.event ? { event: { title: record.event.title, date: record.event.date, venue: record.event.venue } } : {}),
    journey: {
      pickupAddress: record.journey.pickupAddress,
      destinationAddress: record.journey.destinationAddress,
      date: record.journey.date,
      time: record.journey.time,
      returnJourney: record.journey.returnJourney,
      ...(record.journey.returnJourney
        ? { returnDate: record.journey.returnDate, returnTime: record.journey.returnTime }
        : {}),
      passengers: record.journey.passengers,
      additionalStops: [...record.journey.additionalStops],
    },
    ...(showQuote && record.quote
      ? {
          quote: {
            version: record.quote.version,
            amountGbp: record.quote.amountGbp,
            expiresAt: record.quote.expiresAt,
            ...(record.quote.customerMessage ? { customerMessage: record.quote.customerMessage } : {}),
            payable:
              record.status === "QUOTED" &&
              !isBespokeQuoteExpired(record, now) &&
              record.owner.availability !== "unavailable",
          },
        }
      : {}),
  };
}

export type BespokeQuoteOwnerSummary = {
  reference: string;
  category: BespokeQuoteCategory;
  status: BespokeQuoteStatus;
  createdAt: string;
  updatedAt: string;
  /** Minimised for the KV index: first name + last initial only (e.g. "Jane D."). */
  customerLabel: string;
  date: string;
  time: string;
  passengers: number;
  eventTitle?: string;
  serviceType?: BusinessClassRequestServiceType;
  reviewOpen: boolean;
  quotedAmountGbp?: number;
  quoteExpiresAt?: string;
};

/** "Jane Doe" → "Jane D." — enough for the owner list, minimal for storage. */
export function minimisedCustomerLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  const first = parts[0].slice(0, 30);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]?.toUpperCase() ?? ""}.` : "";
  return `${first}${lastInitial}`;
}

/** Small summary stored as KV list metadata (must stay well under 1 KB). */
export function toBespokeQuoteOwnerSummary(record: BespokeQuoteRecord): BespokeQuoteOwnerSummary {
  return {
    reference: record.reference,
    category: record.category,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    customerLabel: minimisedCustomerLabel(record.customer.name),
    date: record.journey.date,
    time: record.journey.time,
    passengers: record.journey.passengers,
    ...(record.event ? { eventTitle: record.event.title.slice(0, 80) } : {}),
    ...(record.serviceType ? { serviceType: record.serviceType } : {}),
    reviewOpen: Boolean(record.review?.open),
    ...(record.quote ? { quotedAmountGbp: record.quote.amountGbp, quoteExpiresAt: record.quote.expiresAt } : {}),
  };
}

/** Full owner view (owner-authenticated endpoints only). Token hash removed. */
export function toBespokeQuoteOwnerView(record: BespokeQuoteRecord) {
  const { quote, ...rest } = record;
  let ownerQuote: Omit<BespokeQuoteOffer, "tokenHash"> | undefined;
  if (quote) {
    const { tokenHash: _omit, ...visible } = quote;
    void _omit;
    ownerQuote = visible;
  }
  return {
    ...rest,
    ...(ownerQuote ? { quote: ownerQuote } : {}),
    statusLabel: BESPOKE_QUOTE_OWNER_STATUS_LABELS[record.status],
    estimatedProfitGbp: bespokeEstimatedProfitGbp(record),
  };
}
