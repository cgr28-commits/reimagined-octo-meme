import type { PaidBookingDetails } from "../shared/booking-notifications";

export type PendingCheckoutRecord = {
  checkoutId: string;
  checkoutReference: string;
  amount: number;
  booking: PaidBookingDetails;
  createdAt: string;
  /** Set when owner/customer emails have been sent for this checkout. */
  finalizedAt?: string;
  paymentReference?: string;
};

export function pendingCheckoutKey(checkoutId: string): string {
  return `pending-checkout:${checkoutId.trim()}`;
}

export function paidBookingCheckoutKey(checkoutId: string): string {
  return `booking:checkout:${checkoutId.trim()}`;
}

export function pendingCheckoutStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

export async function savePendingCheckout(
  store: KVNamespace,
  record: PendingCheckoutRecord,
): Promise<void> {
  await store.put(pendingCheckoutKey(record.checkoutId), JSON.stringify(record), {
    // Keep long enough for delayed returns / webhook retries.
    expirationTtl: 60 * 60 * 24 * 14,
  });
}

export async function getPendingCheckout(
  store: KVNamespace,
  checkoutId: string,
): Promise<PendingCheckoutRecord | null> {
  const record = await store.get<PendingCheckoutRecord>(pendingCheckoutKey(checkoutId), "json");
  if (!record?.checkoutId || !record.booking?.customerEmail) {
    return null;
  }
  return record;
}

export async function markPendingCheckoutFinalized(
  store: KVNamespace,
  checkoutId: string,
  paymentReference: string,
): Promise<void> {
  const existing = await getPendingCheckout(store, checkoutId);
  if (!existing) {
    return;
  }
  const updated: PendingCheckoutRecord = {
    ...existing,
    finalizedAt: new Date().toISOString(),
    paymentReference,
  };
  await savePendingCheckout(store, updated);
}
