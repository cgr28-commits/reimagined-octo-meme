/**
 * Personal Quote Codes — individually agreed fares (not vouchers/promos).
 * Authorised amount always lives server-side in KV; the browser never decides the price.
 */

import { getWebsiteReturnJourneyFare } from "./return-journey-discount";

export type PersonalQuoteRecord = {
  /** Public code, e.g. MQ-7K4P9X */
  code: string;
  customerName: string;
  customerEmail?: string;
  /** Optional UK/international mobile for prefill. */
  customerMobile?: string;
  /** Authorised SumUp / booking amount (GBP). */
  agreedAmount: number;
  /** Website-calculated fare at issue time (display / audit only). */
  standardWebsiteAmount?: number;
  /** standardWebsiteAmount - agreedAmount when both are present. */
  discountAmount?: number;
  /**
   * Opaque customer link token (hex). Prefer this over the MQ code for private links.
   * Legacy records may omit it until lazily backfilled on owner read/create.
   */
  customerToken?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  notes?: string;
  singleUse: boolean;
  /** Owner can deactivate without deleting. */
  active: boolean;
  createdAt: string;
  /** Inclusive expiry as YYYY-MM-DD (Europe/London calendar day). */
  expiresOn: string;
  usedAt?: string;
  associatedPaymentReference?: string;
  associatedCheckoutId?: string;
};

/**
 * Customer-safe public summary (token lookup + MQ validate).
 * Never includes stored customer email/mobile — those stay owner-only.
 */
export type PersonalQuotePublicSummary = {
  code: string;
  customerName: string;
  agreedAmount: number;
  amountLabel: string;
  standardWebsiteAmount?: number;
  standardWebsiteAmountLabel?: string;
  discountAmount?: number;
  discountAmountLabel?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  notes?: string;
  expiresOn: string;
  singleUse: boolean;
};

/** Personal-quote payment links are limited to saloon/estate capacity (not minibus). */
export const PERSONAL_QUOTE_MIN_PASSENGERS = 1;
export const PERSONAL_QUOTE_MAX_PASSENGERS = 4;

export const PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR =
  "This personal quote is for up to 4 passengers. Please select 1–4 passengers, or contact My Airport Taxi NI for a larger vehicle.";

export function isValidPersonalQuotePassengerCount(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return (
    Number.isInteger(n) &&
    n >= PERSONAL_QUOTE_MIN_PASSENGERS &&
    n <= PERSONAL_QUOTE_MAX_PASSENGERS
  );
}

function roundGbp(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Currency-safe equality for GBP amounts (½p tolerance). */
export function personalQuoteAmountsEqual(a: number, b: number): boolean {
  return Math.abs(roundGbp(a) - roundGbp(b)) < 0.005;
}

/**
 * True when the customer is already receiving a Personal Quote discount vs the
 * stored one-way website fare. Missing standardWebsiteAmount ⇒ treat as a
 * manually agreed fare (not eligible for the public-site return discount stacking).
 */
export function isPersonallyDiscountedPersonalQuote(
  agreedAmount: number,
  standardWebsiteAmount?: number | null,
): boolean {
  if (
    typeof standardWebsiteAmount !== "number" ||
    !Number.isFinite(standardWebsiteAmount)
  ) {
    return true;
  }
  return roundGbp(agreedAmount) < roundGbp(standardWebsiteAmount) - 0.004;
}

/**
 * Authoritative SumUp / checkout amount from stored ONE-WAY Personal Quote figures.
 * Never trust browser-supplied totals — only returnJourney (boolean) from the booking.
 *
 * Rules:
 * - one-way → agreedAmount
 * - return + not personally discounted (agreed == standard) → website return fare
 *   (shared returnJourneyDiscountRate via getWebsiteReturnJourneyFare)
 * - return + personally discounted OR no standard → agreed × 2
 */
export function resolvePersonalQuoteCheckoutAmount(input: {
  agreedAmount: number;
  standardWebsiteAmount?: number | null;
  returnJourney: boolean;
}): number {
  const agreed = roundGbp(Number(input.agreedAmount));
  if (!Number.isFinite(agreed) || agreed < 1) {
    return NaN;
  }
  if (!input.returnJourney) {
    return agreed;
  }

  const standard =
    typeof input.standardWebsiteAmount === "number" &&
    Number.isFinite(input.standardWebsiteAmount)
      ? roundGbp(input.standardWebsiteAmount)
      : undefined;

  const personallyDiscounted =
    standard == null || isPersonallyDiscountedPersonalQuote(agreed, standard);

  if (!personallyDiscounted && standard != null) {
    return getWebsiteReturnJourneyFare(agreed);
  }
  return roundGbp(agreed * 2);
}

export type PersonalQuotePaymentDisplay = {
  paymentAmount: number;
  paymentAmountLabel: string;
  oneWayAgreedAmount: number;
  oneWayAgreedLabel: string;
  returnJourney: boolean;
  personallyDiscounted: boolean;
  appliesWebsiteReturnDiscount: boolean;
  standardWebsiteAmount?: number;
  standardWebsiteAmountLabel?: string;
};

export function describePersonalQuotePayment(input: {
  agreedAmount: number;
  standardWebsiteAmount?: number | null;
  returnJourney: boolean;
}): PersonalQuotePaymentDisplay {
  const oneWay = roundGbp(input.agreedAmount);
  const standard =
    typeof input.standardWebsiteAmount === "number" &&
    Number.isFinite(input.standardWebsiteAmount)
      ? roundGbp(input.standardWebsiteAmount)
      : undefined;
  const personallyDiscounted = isPersonallyDiscountedPersonalQuote(oneWay, standard);
  const appliesWebsiteReturnDiscount =
    Boolean(input.returnJourney) && !personallyDiscounted && standard != null;
  const paymentAmount = resolvePersonalQuoteCheckoutAmount({
    agreedAmount: oneWay,
    standardWebsiteAmount: standard,
    returnJourney: input.returnJourney,
  });

  return {
    paymentAmount,
    paymentAmountLabel: formatPersonalQuoteAmount(paymentAmount),
    oneWayAgreedAmount: oneWay,
    oneWayAgreedLabel: formatPersonalQuoteAmount(oneWay),
    returnJourney: Boolean(input.returnJourney),
    personallyDiscounted,
    appliesWebsiteReturnDiscount,
    ...(standard != null
      ? {
          standardWebsiteAmount: standard,
          standardWebsiteAmountLabel: formatPersonalQuoteAmount(standard),
        }
      : {}),
  };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function personalQuoteCodeKey(code: string): string {
  return `personal-quote:code:${normalizePersonalQuoteCode(code)}`;
}

export function personalQuoteOpenIndexKey(): string {
  return "personal-quote:open";
}

export function personalQuoteTokenKey(token: string): string {
  return `personal-quote:token:${normalizePersonalQuoteCustomerToken(token)}`;
}

export function normalizePersonalQuoteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function normalizePersonalQuoteCustomerToken(token: string): string {
  return token.trim().toLowerCase().replace(/[^a-f0-9]/g, "");
}

/** Strong unpredictable code: MQ-XXXXXX (no sequential IDs). */
export function generatePersonalQuoteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < 6; i++) {
    body += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `MQ-${body}`;
}

/** Opaque customer-link token (~192 bits). Never put fare/email in the URL. */
export function generatePersonalQuoteCustomerToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatPersonalQuoteAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `£${rounded.toFixed(2)}`;
}

export function londonYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type PersonalQuoteRedeemError =
  | "not_found"
  | "inactive"
  | "expired"
  | "already_used"
  | "invalid_amount"
  | "reserved";

/** Short-lived checkout lock for single-use quotes (KV TTL + expiresAt). */
export const PERSONAL_QUOTE_RESERVATION_TTL_SECONDS = 25 * 60;

export type PersonalQuoteReservation = {
  code: string;
  /** Opaque attempt id — must match to update/clear this reservation. */
  attemptId: string;
  checkoutReference?: string;
  checkoutId?: string;
  /** Hosted SumUp URL — allows reuse without a second checkout create. */
  paymentUrl?: string;
  createdAt: string;
  /** ISO timestamp — reservation is inactive at/after this instant. */
  expiresAt: string;
};

export function personalQuoteReservationKey(code: string): string {
  return `personal-quote:reservation:${normalizePersonalQuoteCode(code)}`;
}

export function generatePersonalQuoteAttemptId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isPersonalQuoteReservationActive(
  reservation: PersonalQuoteReservation | null | undefined,
  now = new Date(),
): boolean {
  if (!reservation?.code || !reservation.attemptId || !reservation.expiresAt) {
    return false;
  }
  const expiresMs = Date.parse(reservation.expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > now.getTime();
}

export function buildPersonalQuoteReservation(input: {
  code: string;
  attemptId: string;
  checkoutReference?: string;
  checkoutId?: string;
  paymentUrl?: string;
  now?: Date;
  ttlSeconds?: number;
}): PersonalQuoteReservation {
  const now = input.now ?? new Date();
  const ttl = input.ttlSeconds ?? PERSONAL_QUOTE_RESERVATION_TTL_SECONDS;
  return {
    code: normalizePersonalQuoteCode(input.code),
    attemptId: input.attemptId,
    ...(input.checkoutReference ? { checkoutReference: input.checkoutReference } : {}),
    ...(input.checkoutId ? { checkoutId: input.checkoutId } : {}),
    ...(input.paymentUrl ? { paymentUrl: input.paymentUrl } : {}),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
}

/**
 * Normalise and validate agreed / standard / discount amounts.
 * Authoritative payment amount is always agreedAmount.
 */
export function resolvePersonalQuotePricing(input: {
  agreedAmount?: unknown;
  standardWebsiteAmount?: unknown;
  discountAmount?: unknown;
}):
  | {
      ok: true;
      agreedAmount: number;
      standardWebsiteAmount?: number;
      discountAmount?: number;
    }
  | { ok: false; error: string } {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const hasAgreed =
    input.agreedAmount !== undefined &&
    input.agreedAmount !== null &&
    String(input.agreedAmount).trim() !== "";
  const hasStandard =
    input.standardWebsiteAmount !== undefined &&
    input.standardWebsiteAmount !== null &&
    String(input.standardWebsiteAmount).trim() !== "";
  const hasDiscount =
    input.discountAmount !== undefined &&
    input.discountAmount !== null &&
    String(input.discountAmount).trim() !== "";

  const agreedRaw = hasAgreed ? Number(input.agreedAmount) : NaN;
  const standardRaw = hasStandard ? Number(input.standardWebsiteAmount) : NaN;
  const discountRaw = hasDiscount ? Number(input.discountAmount) : NaN;

  if (hasAgreed && !Number.isFinite(agreedRaw)) {
    return { ok: false, error: "Agreed fare must be a valid amount" };
  }
  if (hasStandard && !Number.isFinite(standardRaw)) {
    return { ok: false, error: "Standard website fare must be a valid amount" };
  }
  if (hasDiscount && !Number.isFinite(discountRaw)) {
    return { ok: false, error: "Discount must be a valid amount" };
  }

  let agreedAmount = hasAgreed ? round2(agreedRaw) : NaN;
  let standardWebsiteAmount = hasStandard ? round2(standardRaw) : undefined;
  let discountAmount = hasDiscount ? round2(discountRaw) : undefined;

  if (typeof standardWebsiteAmount === "number") {
    if (standardWebsiteAmount < 1) {
      return { ok: false, error: "Standard website fare must be at least £1" };
    }
    if (typeof discountAmount === "number") {
      if (discountAmount < 0) {
        return { ok: false, error: "Discount cannot be negative" };
      }
      if (discountAmount > standardWebsiteAmount) {
        return { ok: false, error: "Discount cannot exceed the standard website fare" };
      }
      const derivedAgreed = round2(standardWebsiteAmount - discountAmount);
      if (hasAgreed && Math.abs(agreedAmount - derivedAgreed) > 0.009) {
        return {
          ok: false,
          error: "Agreed fare must equal standard fare minus discount",
        };
      }
      agreedAmount = derivedAgreed;
    } else if (hasAgreed) {
      discountAmount = round2(standardWebsiteAmount - agreedAmount);
      if (discountAmount < 0) {
        return {
          ok: false,
          error: "Agreed fare cannot exceed the standard website fare when both are set",
        };
      }
    } else {
      return { ok: false, error: "Agreed fare or discount is required when a standard fare is set" };
    }
  } else if (typeof discountAmount === "number") {
    return {
      ok: false,
      error: "Discount requires a standard website fare",
    };
  }

  if (!Number.isFinite(agreedAmount)) {
    return { ok: false, error: "Agreed fare is required" };
  }
  if (agreedAmount < 1 || agreedAmount > 5000) {
    return { ok: false, error: "Agreed price must be between £1 and £5000" };
  }

  if (typeof discountAmount === "number" && discountAmount === 0) {
    discountAmount = undefined;
  }

  return {
    ok: true,
    agreedAmount,
    ...(typeof standardWebsiteAmount === "number" ? { standardWebsiteAmount } : {}),
    ...(typeof discountAmount === "number" ? { discountAmount } : {}),
  };
}

/**
 * Client-side linked fields: editing discount or final fare updates the other.
 * Returns null when inputs are incomplete/invalid (caller shows validation separately).
 */
export function computeLinkedPersonalQuoteFares(input: {
  standardWebsiteAmount: number | null;
  discountAmount: number | null;
  agreedAmount: number | null;
  edited: "discount" | "agreed" | "standard";
}): { discountAmount: number | null; agreedAmount: number | null } | null {
  const standard = input.standardWebsiteAmount;
  if (standard == null || !Number.isFinite(standard) || standard < 1) {
    return null;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;

  if (input.edited === "discount" || input.edited === "standard") {
    const discount = input.discountAmount;
    if (discount == null || !Number.isFinite(discount)) return null;
    if (discount < 0 || discount > standard) return null;
    return {
      discountAmount: round2(discount),
      agreedAmount: round2(standard - discount),
    };
  }

  const agreed = input.agreedAmount;
  if (agreed == null || !Number.isFinite(agreed)) return null;
  if (agreed < 1 || agreed > standard) return null;
  return {
    agreedAmount: round2(agreed),
    discountAmount: round2(standard - agreed),
  };
}

/** Static-export friendly customer URL — token only, never fare. */
export function buildPersonalQuoteCustomerPath(token: string): string {
  const normalized = normalizePersonalQuoteCustomerToken(token);
  return `/personal-quote/?t=${encodeURIComponent(normalized)}`;
}

export function buildPersonalQuoteCustomerUrl(token: string, siteOrigin: string): string {
  const origin = siteOrigin.replace(/\/$/, "");
  return `${origin}${buildPersonalQuoteCustomerPath(token)}`;
}

export function buildPersonalQuoteWhatsAppMessage(input: {
  customerName: string;
  agreedAmount: number;
  pickupLabel?: string;
  dropoffLabel?: string;
  customerUrl: string;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const journeyHint =
    input.pickupLabel?.toLowerCase().includes("airport") ||
    input.dropoffLabel?.toLowerCase().includes("airport")
      ? "airport transfer"
      : "transfer";
  return `Hi ${firstName}, here is your private quote from My Airport Taxi NI for your ${journeyHint}. Your agreed fixed price is ${formatPersonalQuoteAmount(input.agreedAmount)}. You can review the journey and pay securely here: ${input.customerUrl}`;
}

/**
 * Server-side redeemability check. Does not mutate the record.
 * Failed/abandoned SumUp must leave the quote redeemable (no soft permanent lock here).
 */
export function evaluatePersonalQuote(
  record: PersonalQuoteRecord | null | undefined,
  now = new Date(),
): { ok: true; record: PersonalQuoteRecord } | { ok: false; error: PersonalQuoteRedeemError } {
  if (!record?.code || !Number.isFinite(record.agreedAmount)) {
    return { ok: false, error: "not_found" };
  }
  if (!record.active) {
    return { ok: false, error: "inactive" };
  }
  if (record.singleUse && record.usedAt) {
    return { ok: false, error: "already_used" };
  }
  const today = londonYmd(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.expiresOn) || record.expiresOn < today) {
    return { ok: false, error: "expired" };
  }
  if (record.agreedAmount < 1 || record.agreedAmount > 5000) {
    return { ok: false, error: "invalid_amount" };
  }
  return { ok: true, record };
}

export function toPersonalQuotePublicSummary(
  record: PersonalQuoteRecord,
): PersonalQuotePublicSummary {
  const discount =
    typeof record.discountAmount === "number" && Number.isFinite(record.discountAmount)
      ? record.discountAmount
      : typeof record.standardWebsiteAmount === "number"
        ? Math.round((record.standardWebsiteAmount - record.agreedAmount) * 100) / 100
        : undefined;
  const showDiscount =
    typeof discount === "number" && discount > 0 && typeof record.standardWebsiteAmount === "number";

  return {
    code: record.code,
    customerName: record.customerName,
    agreedAmount: record.agreedAmount,
    amountLabel: formatPersonalQuoteAmount(record.agreedAmount),
    ...(typeof record.standardWebsiteAmount === "number"
      ? {
          standardWebsiteAmount: record.standardWebsiteAmount,
          standardWebsiteAmountLabel: formatPersonalQuoteAmount(record.standardWebsiteAmount),
        }
      : {}),
    ...(showDiscount
      ? {
          discountAmount: discount,
          discountAmountLabel: formatPersonalQuoteAmount(discount),
        }
      : {}),
    ...(record.pickupLabel ? { pickupLabel: record.pickupLabel } : {}),
    ...(record.dropoffLabel ? { dropoffLabel: record.dropoffLabel } : {}),
    ...(record.notes ? { notes: record.notes } : {}),
    expiresOn: record.expiresOn,
    singleUse: record.singleUse,
  };
}

export function personalQuoteCustomerError(error: PersonalQuoteRedeemError): string {
  switch (error) {
    case "expired":
      return "This personal quote has expired. Please contact My Airport Taxi NI for a new quote.";
    case "already_used":
      return "This personal quote has already been used. Please contact My Airport Taxi NI if you need another booking.";
    case "inactive":
      return "This personal quote is no longer active. Please contact My Airport Taxi NI.";
    case "reserved":
      return "This personal quote is currently being used for another payment attempt. Please try again shortly.";
    default:
      return "We couldn’t apply that quote code. Please check the code or contact My Airport Taxi NI.";
  }
}

/** Token-lookup specific copy (invalid/unknown token). */
export function personalQuoteTokenCustomerError(error: PersonalQuoteRedeemError): string {
  switch (error) {
    case "expired":
    case "already_used":
    case "inactive":
    case "reserved":
      return personalQuoteCustomerError(error);
    default:
      return "This personal quote link is invalid or no longer available. Please contact My Airport Taxi NI.";
  }
}
