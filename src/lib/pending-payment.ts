import type { BookingDetails } from "@/lib/booking-message";

const PENDING_PAYMENT_KEY = "matni-pending-payment";
const PENDING_BY_TOKEN_PREFIX = "matni-pending-token-";
const PAYMENT_CONFIRMED_PREFIX = "matni-payment-confirmed-";
const PAYMENT_SUMMARY_PREFIX = "matni-payment-summary-";

export type PendingPayment = {
  checkoutId: string;
  booking: BookingDetails;
};

function parsePendingPayment(raw: string | null): PendingPayment | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingPayment;
    if (!parsed?.checkoutId || !parsed?.booking?.customerName) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createPaymentReturnToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `return-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function savePendingPayment(pending: PendingPayment, returnToken?: string): void {
  localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(pending));
  if (returnToken) {
    localStorage.setItem(`${PENDING_BY_TOKEN_PREFIX}${returnToken}`, JSON.stringify(pending));
  }
}

export function readPendingPayment(): PendingPayment | null {
  return parsePendingPayment(localStorage.getItem(PENDING_PAYMENT_KEY));
}

export function readPendingPaymentByToken(returnToken: string): PendingPayment | null {
  return parsePendingPayment(localStorage.getItem(`${PENDING_BY_TOKEN_PREFIX}${returnToken}`));
}

export function clearPendingPayment(returnToken?: string): void {
  localStorage.removeItem(PENDING_PAYMENT_KEY);
  if (returnToken) {
    localStorage.removeItem(`${PENDING_BY_TOKEN_PREFIX}${returnToken}`);
  }
}

export function hasConfirmedPayment(checkoutId: string): boolean {
  return localStorage.getItem(`${PAYMENT_CONFIRMED_PREFIX}${checkoutId}`) === "1";
}

export function markPaymentConfirmed(checkoutId: string, summary?: string, returnToken?: string): void {
  localStorage.setItem(`${PAYMENT_CONFIRMED_PREFIX}${checkoutId}`, "1");
  if (summary) {
    localStorage.setItem(`${PAYMENT_SUMMARY_PREFIX}${checkoutId}`, summary);
  }
  clearPendingPayment(returnToken);
}

export function readPaymentConfirmationSummary(checkoutId: string): string | null {
  return localStorage.getItem(`${PAYMENT_SUMMARY_PREFIX}${checkoutId}`);
}

export function resolveCheckoutIdFromUrl(search: string): string {
  const params = new URLSearchParams(search);
  return (
    params.get("checkout_id")?.trim() ||
    params.get("checkoutId")?.trim() ||
    ""
  );
}

export function resolveReturnTokenFromUrl(search: string): string {
  return new URLSearchParams(search).get("return_token")?.trim() ?? "";
}
