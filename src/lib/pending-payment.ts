import type { BookingDetails } from "@/lib/booking-message";

const PENDING_PAYMENT_KEY = "matni-pending-payment";
const PAYMENT_CONFIRMED_PREFIX = "matni-payment-confirmed-";

export type PendingPayment = {
  checkoutId: string;
  booking: BookingDetails;
};

export function savePendingPayment(pending: PendingPayment): void {
  localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(pending));
}

export function readPendingPayment(): PendingPayment | null {
  const raw = localStorage.getItem(PENDING_PAYMENT_KEY);
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

export function clearPendingPayment(): void {
  localStorage.removeItem(PENDING_PAYMENT_KEY);
}

export function hasConfirmedPayment(checkoutId: string): boolean {
  return localStorage.getItem(`${PAYMENT_CONFIRMED_PREFIX}${checkoutId}`) === "1";
}

export function markPaymentConfirmed(checkoutId: string): void {
  localStorage.setItem(`${PAYMENT_CONFIRMED_PREFIX}${checkoutId}`, "1");
  clearPendingPayment();
}

export function resolveCheckoutIdFromUrl(search: string): string {
  const params = new URLSearchParams(search);
  return (
    params.get("checkout_id")?.trim() ||
    params.get("checkoutId")?.trim() ||
    ""
  );
}
