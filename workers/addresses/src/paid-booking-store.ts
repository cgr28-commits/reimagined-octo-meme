import {
  paidBookingCheckoutKey,
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
  if (record.checkoutId?.trim()) {
    await store.put(paidBookingCheckoutKey(record.checkoutId), record.paymentReference, {
      expirationTtl: 60 * 60 * 24 * 400,
    });
  }
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

export async function getPaidBookingRecordByCheckoutId(
  store: KVNamespace,
  checkoutId: string,
): Promise<PaidBookingRecord | null> {
  const paymentReference = await store.get(paidBookingCheckoutKey(checkoutId));
  if (!paymentReference?.trim()) {
    return null;
  }
  return getPaidBookingRecord(store, paymentReference.trim());
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

export type PaidBookingUpdateFields = Partial<
  Pick<
    PaidBookingRecord,
    "tripDate" | "tripTime" | "pickupLabel" | "dropoffLabel" | "mobileNumber" | "tripLabel"
  >
>;

export async function updatePaidBookingFields(
  store: KVNamespace,
  paymentReference: string,
  fields: PaidBookingUpdateFields,
): Promise<PaidBookingRecord | null> {
  const record = await getPaidBookingRecord(store, paymentReference);
  if (!record || record.status === "refunded") {
    return null;
  }

  const cleaned = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as PaidBookingUpdateFields;

  if (Object.keys(cleaned).length === 0) {
    return record;
  }

  const updated: PaidBookingRecord = {
    ...record,
    ...cleaned,
  };

  await savePaidBookingRecord(store, updated);
  return updated;
}
