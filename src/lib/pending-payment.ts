import type { BookingDetails } from "@/lib/booking-message";
import type { PaymentConfirmationResult } from "@/lib/create-payment";

const PENDING_PAYMENT_KEY = "matni-pending-payment";
const PENDING_BY_TOKEN_PREFIX = "matni-pending-token-";
const PAYMENT_CONFIRMED_PREFIX = "matni-payment-confirmed-";
const PAYMENT_SUMMARY_PREFIX = "matni-payment-summary-";
const PAYMENT_RESULT_PREFIX = "matni-payment-result-";

export type PendingPayment = {
  checkoutId: string;
  booking: BookingDetails;
  paymentUrl?: string;
  checkoutReference?: string;
  amountLabel?: string;
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

export function savePaymentConfirmationResult(
  checkoutId: string,
  result: PaymentConfirmationResult,
): void {
  localStorage.setItem(`${PAYMENT_RESULT_PREFIX}${checkoutId}`, JSON.stringify(result));
}

export function readPaymentConfirmationResult(
  checkoutId: string,
): PaymentConfirmationResult | null {
  const raw = localStorage.getItem(`${PAYMENT_RESULT_PREFIX}${checkoutId}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PaymentConfirmationResult;
  } catch {
    return null;
  }
}

export function paymentNeedsFollowUp(result: PaymentConfirmationResult): boolean {
  return result.emailSent === false || result.calendarLogged === false;
}

export function markPaymentConfirmed(
  checkoutId: string,
  summary?: string,
  returnToken?: string,
  result?: PaymentConfirmationResult,
): void {
  localStorage.setItem(`${PAYMENT_CONFIRMED_PREFIX}${checkoutId}`, "1");
  if (summary) {
    localStorage.setItem(`${PAYMENT_SUMMARY_PREFIX}${checkoutId}`, summary);
  }
  if (result) {
    savePaymentConfirmationResult(checkoutId, result);
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
