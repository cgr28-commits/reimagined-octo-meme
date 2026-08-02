import {
  paidBookingRefKey,
  type PaidBookingRecord,
} from "../shared/paid-booking-record";

export function paidBookingStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

export async function savePaidBookingRecord(
  store: KVNamespace,
  record: PaidBookingRecord,
): Promise<void> {
  await store.put(paidBookingRefKey(record.paymentReference), JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 400,
  });
}

export async function getPaidBookingRecord(
  store: KVNamespace,
  paymentReference: string,
): Promise<PaidBookingRecord | null> {
  const record = await store.get<PaidBookingRecord>(paidBookingRefKey(paymentReference), "json");
  if (!record?.paymentReference) {
    return null;
  }

  return record;
}

export async function markPaidBookingRefunded(
  store: KVNamespace,
  paymentReference: string,
  refundAmountLabel: string,
): Promise<PaidBookingRecord | null> {
  const record = await getPaidBookingRecord(store, paymentReference);
  if (!record) {
    return null;
  }

  const updated: PaidBookingRecord = {
    ...record,
    status: "refunded",
    refundedAt: new Date().toISOString(),
    refundAmountLabel,
  };

  await savePaidBookingRecord(store, updated);
  return updated;
}
