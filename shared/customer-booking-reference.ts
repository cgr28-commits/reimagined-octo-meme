/**
 * Short customer-facing booking references: MAT-4827
 *
 * Distinct from:
 * - MATNI-1001 (enquiry booking counter)
 * - matni-{timestamp}-{hex} (SumUp checkout_reference)
 * - SumUp transaction codes (paymentReference on PaidBookingRecord)
 */

export const CUSTOMER_BOOKING_REF_PREFIX = "MAT-";

const CUSTOMER_REF_PATTERN = /^MAT-(\d{4})$/i;

/** Format four digits as MAT-4827 (zero-padded). */
export function formatCustomerBookingReference(digits: number): string {
  const n = Math.floor(Math.abs(Number(digits))) % 10000;
  return `${CUSTOMER_BOOKING_REF_PREFIX}${String(n).padStart(4, "0")}`;
}

/** Random 0–9999 for MAT-####. */
export function randomCustomerBookingRefDigits(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint16Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % 10000;
  }
  return Math.floor(Math.random() * 10000);
}

export function generateCustomerBookingReference(): string {
  return formatCustomerBookingReference(randomCustomerBookingRefDigits());
}

/**
 * Normalise user input to MAT-#### (uppercase) or null if not that shape.
 * Trims whitespace; accepts mat-4827.
 */
export function normalizeCustomerBookingReference(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(CUSTOMER_REF_PATTERN);
  if (!match) return null;
  return formatCustomerBookingReference(Number(match[1]));
}

export function isCustomerBookingReference(raw: string | null | undefined): boolean {
  return normalizeCustomerBookingReference(raw) !== null;
}

/** Prefer short customer ref for display; fall back to paymentReference. */
export function displayBookingReference(record: {
  customerReference?: string | null;
  paymentReference?: string | null;
}): string {
  const short = normalizeCustomerBookingReference(record.customerReference ?? "");
  if (short) return short;
  return String(record.paymentReference ?? "").trim();
}
