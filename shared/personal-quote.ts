/**
 * Personal Quote Codes — individually agreed fares (not vouchers/promos).
 * Authorised amount always lives server-side in KV; the browser never decides the price.
 */

export type PersonalQuoteRecord = {
  /** Public code, e.g. MQ-7K4P9X */
  code: string;
  customerName: string;
  customerEmail?: string;
  /** Authorised SumUp / booking amount (GBP). */
  agreedAmount: number;
  /** Website-calculated fare at issue time (display / audit only). */
  standardWebsiteAmount?: number;
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

export type PersonalQuotePublicSummary = {
  code: string;
  customerName: string;
  agreedAmount: number;
  amountLabel: string;
  standardWebsiteAmount?: number;
  standardWebsiteAmountLabel?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  expiresOn: string;
  singleUse: boolean;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function personalQuoteCodeKey(code: string): string {
  return `personal-quote:code:${normalizePersonalQuoteCode(code)}`;
}

export function personalQuoteOpenIndexKey(): string {
  return "personal-quote:open";
}

export function normalizePersonalQuoteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
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
    ...(record.pickupLabel ? { pickupLabel: record.pickupLabel } : {}),
    ...(record.dropoffLabel ? { dropoffLabel: record.dropoffLabel } : {}),
    expiresOn: record.expiresOn,
    singleUse: record.singleUse,
  };
}

export function personalQuoteCustomerError(error: PersonalQuoteRedeemError): string {
  switch (error) {
    case "expired":
      return "That personal quote has expired. Please contact My Airport Taxi NI.";
    case "already_used":
      return "That personal quote has already been used. Please contact My Airport Taxi NI.";
    case "inactive":
      return "That personal quote is no longer active. Please contact My Airport Taxi NI.";
    case "reserved":
      return "This personal quote is currently being used for another payment attempt. Please try again shortly.";
    default:
      return "We couldn’t apply that quote code. Please check the code or contact My Airport Taxi NI.";
  }
}
