import {
  paidBookingCheckoutKey,
  paidBookingCreatedDayIndexKey,
  paidBookingRefKey,
  paidBookingTripDayIndexKey,
  type PaidBookingEditAuditEntry,
  type PaidBookingRecord,
} from "../shared/paid-booking-record";

const RECORD_TTL = 60 * 60 * 24 * 400;
const DAY_INDEX_TTL = 60 * 60 * 24 * 400;

export function paidBookingStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
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

function londonToday(): string {
  return londonDateFromIso(new Date().toISOString());
}

function addDaysYmd(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
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

async function removeIdFromDayIndex(
  store: KVNamespace,
  indexKey: string,
  paymentReference: string,
): Promise<void> {
  const existing = await store.get<string[]>(indexKey, "json");
  if (!Array.isArray(existing) || existing.length === 0) return;
  const next = existing.filter((id) => id !== paymentReference);
  if (next.length === existing.length) return;
  if (next.length === 0) {
    await store.delete(indexKey);
    return;
  }
  await store.put(indexKey, JSON.stringify(next), {
    expirationTtl: DAY_INDEX_TTL,
  });
}

export async function savePaidBookingRecord(
  store: KVNamespace,
  record: PaidBookingRecord,
  options?: { previousTripDate?: string },
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
  const tripDay = record.tripDate?.trim();
  if (tripDay && /^\d{4}-\d{2}-\d{2}$/.test(tripDay)) {
    const previousTripDate = options?.previousTripDate?.trim();
    if (previousTripDate && previousTripDate !== tripDay && /^\d{4}-\d{2}-\d{2}$/.test(previousTripDate)) {
      await removeIdFromDayIndex(
        store,
        paidBookingTripDayIndexKey(previousTripDate),
        record.paymentReference,
      );
    }
    await addIdToDayIndex(store, paidBookingTripDayIndexKey(tripDay), record.paymentReference);
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
 * Sorted by payment createdAt (newest first) — prefer listUpcomingPaidBookings for jobs.
 */
export async function listRecentPaidBookings(
  store: KVNamespace,
  options?: { days?: number; limit?: number },
): Promise<PaidBookingRecord[]> {
  const days = Math.min(Math.max(options?.days ?? 14, 1), 90);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const byRef = new Map<string, PaidBookingRecord>();

  const today = londonToday();
  for (let offset = 0; offset < days; offset += 1) {
    const day = addDaysYmd(today, -offset);
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

function tripSortKey(record: PaidBookingRecord): string {
  return `${record.tripDate || "9999-99-99"}T${record.tripTime || "99:99"}`;
}

/**
 * Lists paid bookings for the owner Upcoming Jobs board.
 * Indexed by journey/pickup date (not merely payment-created date), soonest first.
 */
export async function listUpcomingPaidBookings(
  store: KVNamespace,
  options?: { pastDays?: number; futureDays?: number; limit?: number },
): Promise<PaidBookingRecord[]> {
  const pastDays = Math.min(Math.max(options?.pastDays ?? 2, 0), 14);
  const futureDays = Math.min(Math.max(options?.futureDays ?? 90, 1), 180);
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 250);
  const byRef = new Map<string, PaidBookingRecord>();
  const today = londonToday();

  for (let offset = -pastDays; offset <= futureDays; offset += 1) {
    const day = addDaysYmd(today, offset);
    const ids = await store.get<string[]>(paidBookingTripDayIndexKey(day), "json");
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (!id?.trim() || byRef.has(id)) continue;
      const record = await getPaidBookingRecord(store, id);
      if (record) byRef.set(record.paymentReference, record);
    }
  }

  // Always scan booking:ref:* so pre-index / early-paid future trips still appear.
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
  } while (cursor);

  const horizonStart = addDaysYmd(today, -pastDays);
  const horizonEnd = addDaysYmd(today, futureDays);

  return [...byRef.values()]
    .filter((record) => {
      const tripDate = record.tripDate?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return true;
      return tripDate >= horizonStart && tripDate <= horizonEnd;
    })
    .sort((a, b) => tripSortKey(a).localeCompare(tripSortKey(b)))
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

  await savePaidBookingRecord(store, updated, { previousTripDate: record.tripDate });
  return updated;
}

export type PaidBookingUpdateFields = Partial<
  Pick<
    PaidBookingRecord,
    | "tripDate"
    | "tripTime"
    | "pickupLabel"
    | "dropoffLabel"
    | "mobileNumber"
    | "tripLabel"
    | "customerName"
    | "customerEmail"
    | "flightNumber"
    | "returnFlightNumber"
    | "passengers"
    | "suitcases"
    | "childSeats"
    | "childSeatNotes"
    | "notes"
    | "returnJourney"
    | "returnDate"
    | "returnTime"
    | "vehicle"
  >
>;

function auditValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export async function updatePaidBookingFields(
  store: KVNamespace,
  paymentReference: string,
  fields: PaidBookingUpdateFields,
  options?: { appendAudit?: boolean; changedBy?: "Owner" },
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

  const previousTripDate = record.tripDate;
  const audit: PaidBookingEditAuditEntry[] = [];
  const changedBy = options?.changedBy ?? "Owner";

  if (options?.appendAudit !== false) {
    for (const [field, newRaw] of Object.entries(cleaned)) {
      const previousValue = auditValue((record as Record<string, unknown>)[field]);
      const newValue = auditValue(newRaw);
      if (previousValue === newValue) continue;
      audit.push({
        changedAt: new Date().toISOString(),
        field,
        previousValue,
        newValue,
        changedBy,
      });
    }
  }

  const updated: PaidBookingRecord = {
    ...record,
    ...cleaned,
    ...(audit.length > 0
      ? { editHistory: [...(record.editHistory ?? []), ...audit] }
      : {}),
  };

  await savePaidBookingRecord(store, updated, { previousTripDate });
  return updated;
}
