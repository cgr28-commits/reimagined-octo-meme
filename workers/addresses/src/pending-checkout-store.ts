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
  /** Owner notified that payment was started (contact details captured). */
  attemptEmailSentAt?: string;
  /** Owner notified that SumUp did not complete payment. */
  unsuccessfulEmailSentAt?: string;
  /** Short-notice payment token — same booking after Owner approval. */
  shortNoticeToken?: string;
  shortNoticeReference?: string;
  /** Personal quote code — amount always re-validated from KV at checkout create. */
  personalQuoteCode?: string;
  /** Website-calculated fare at checkout (audit); SumUp uses `amount`. */
  standardWebsiteAmount?: number;
  /** Authorised personal-quote fare when a code was applied (audit). */
  personalQuotedAmount?: number;
  /** Quick Quote opaque id — amount always from KV + server re-validation. */
  quickQuoteId?: string;
  /**
   * Owner-only £1 live SumUp refund smoke test. When true, finalize must not
   * create tracking/calendar/customer confirmation emails.
   */
  isRefundTest?: boolean;
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

export async function patchPendingCheckout(
  store: KVNamespace,
  checkoutId: string,
  patch: Partial<
    Pick<PendingCheckoutRecord, "attemptEmailSentAt" | "unsuccessfulEmailSentAt" | "finalizedAt" | "paymentReference">
  >,
): Promise<PendingCheckoutRecord | null> {
  const existing = await getPendingCheckout(store, checkoutId);
  if (!existing) {
    return null;
  }
  const updated: PendingCheckoutRecord = { ...existing, ...patch };
  await savePendingCheckout(store, updated);
  return updated;
}

/**
 * Scan recent pending checkouts (newest-first). Used for owner recovery and cron
 * finalize of SumUp PAID checkouts that never completed email/calendar.
 */
export async function listRecentPendingCheckouts(
  store: KVNamespace,
  options?: { limit?: number },
): Promise<PendingCheckoutRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const records: PendingCheckoutRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await store.list({ prefix: "pending-checkout:", cursor, limit: 100 });
    for (const key of page.keys) {
      const checkoutId = key.name.replace(/^pending-checkout:/, "").trim();
      if (!checkoutId) continue;
      const record = await getPendingCheckout(store, checkoutId);
      if (record) records.push(record);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && records.length < limit * 2);

  return records
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}
