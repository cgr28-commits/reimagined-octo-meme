import {
  paidBookingCheckoutKey,
  paidBookingRefKey,
  type PaidBookingRecord,
} from "../shared/paid-booking-record";

const RECORD_TTL = 60 * 60 * 24 * 400;
const DAY_INDEX_TTL = 60 * 60 * 24 * 400;

export function paidBookingStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

export function paidBookingCreatedDayIndexKey(day: string): string {
  return `booking:created:${day.trim()}`;
}

function londonDateFromIso(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso.slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

async function addIdToDayIndex(
  store: KVNamespace,
  indexKey: string,
  paymentReference: string,
): Promise<void> {
  const existing = await store.get<string[]>(indexKey, "json");
  const ids = Array.isArray(existing) ? existing : [];
  if (!ids.includes(paymentReference)) {
    ids.push(paymentReference);
    await store.put(indexKey, JSON.stringify(ids), {
      expirationTtl: DAY_INDEX_TTL,
    });
  }
}

export async function savePaidBookingRecord(
  store: KVNamespace,
  record: PaidBookingRecord,
): Promise<void> {
  await store.put(paidBookingRefKey(record.paymentReference), JSON.stringify(record), {
    expirationTtl: RECORD_TTL,
  });
  if (record.checkoutId?.trim()) {
    await store.put(paidBookingCheckoutKey(record.checkoutId), record.paymentReference, {
      expirationTtl: RECORD_TTL,
    });
  }
  if (record.createdAt?.trim()) {
    await addIdToDayIndex(
      store,
      paidBookingCreatedDayIndexKey(londonDateFromIso(record.createdAt)),
      record.paymentReference,
    );
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

/**
 * Lists paid bookings. Uses created-day indexes when present, then falls back to
 * scanning `booking:ref:*` so bookings stored before indexing still appear.
 */
export async function listRecentPaidBookings(
  store: KVNamespace,
  options?: { days?: number; limit?: number },
): Promise<PaidBookingRecord[]> {
  const days = Math.min(Math.max(options?.days ?? 14, 1), 90);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const byRef = new Map<string, PaidBookingRecord>();

  const today = londonDateFromIso(new Date().toISOString());
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    const day = date.toISOString().slice(0, 10);
    const ids = await store.get<string[]>(paidBookingCreatedDayIndexKey(day), "json");
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (!id?.trim() || byRef.has(id)) continue;
      const record = await getPaidBookingRecord(store, id);
      if (record) byRef.set(record.paymentReference, record);
    }
  }

  // Fallback for bookings saved before day indexes existed.
  if (byRef.size < limit) {
    let cursor: string | undefined;
    do {
      const page = await store.list({ prefix: "booking:ref:", cursor, limit: 100 });
      for (const key of page.keys) {
        const ref = key.name.replace(/^booking:ref:/, "").trim();
        if (!ref || byRef.has(ref)) continue;
        const record = await getPaidBookingRecord(store, ref);
        if (record) byRef.set(record.paymentReference, record);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor && byRef.size < limit * 2);
  }

  return [...byRef.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
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
