import {
  paidBookingCheckoutKey,
  paidBookingCreatedDayIndexKey,
  paidBookingCustomerRefKey,
  paidBookingManageTokenKey,
  paidBookingRefKey,
  paidBookingRefundTestIndexKey,
  paidBookingAmendmentTestIndexKey,
  paidBookingTripDayIndexKey,
  type PaidBookingEditAuditEntry,
  type PaidBookingRecord,
} from "../shared/paid-booking-record";
import {
  generateCustomerBookingReference,
  normalizeCustomerBookingReference,
} from "../shared/customer-booking-reference";
import {
  generateManageBookingToken,
  normalizeManageBookingToken,
} from "../shared/manage-booking-token";
import { bookingInUpcomingHorizon, isOwnerOperationalTestBooking } from "../shared/upcoming-jobs";

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
  options?: { previousTripDate?: string; previousReturnDate?: string },
): Promise<void> {
  await store.put(paidBookingRefKey(record.paymentReference), JSON.stringify(record), {
    expirationTtl: RECORD_TTL,
  });
  if (record.checkoutId?.trim()) {
    await store.put(paidBookingCheckoutKey(record.checkoutId), record.paymentReference, {
      expirationTtl: RECORD_TTL,
    });
  }
  const customerRef = normalizeCustomerBookingReference(record.customerReference ?? "");
  if (customerRef) {
    await store.put(paidBookingCustomerRefKey(customerRef), record.paymentReference, {
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

  const returnDay = record.returnDate?.trim();
  if (returnDay && /^\d{4}-\d{2}-\d{2}$/.test(returnDay)) {
    const previousReturnDate = options?.previousReturnDate?.trim();
    if (
      previousReturnDate &&
      previousReturnDate !== returnDay &&
      /^\d{4}-\d{2}-\d{2}$/.test(previousReturnDate)
    ) {
      await removeIdFromDayIndex(
        store,
        paidBookingTripDayIndexKey(previousReturnDate),
        record.paymentReference,
      );
    }
    await addIdToDayIndex(store, paidBookingTripDayIndexKey(returnDay), record.paymentReference);
  } else if (options?.previousReturnDate?.trim()) {
    const previousReturnDate = options.previousReturnDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(previousReturnDate)) {
      await removeIdFromDayIndex(
        store,
        paidBookingTripDayIndexKey(previousReturnDate),
        record.paymentReference,
      );
    }
  }

  if (record.isRefundTest) {
    await addIdToDayIndex(
      store,
      paidBookingRefundTestIndexKey(),
      record.paymentReference,
    );
  }
  if (record.isAmendmentTestFixture) {
    await addIdToDayIndex(
      store,
      paidBookingAmendmentTestIndexKey(),
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

export async function getPaidBookingRecordByCustomerReference(
  store: KVNamespace,
  customerReference: string,
): Promise<PaidBookingRecord | null> {
  const normalized = normalizeCustomerBookingReference(customerReference);
  if (!normalized) return null;
  const paymentReference = await store.get(paidBookingCustomerRefKey(normalized));
  if (!paymentReference?.trim()) return null;
  return getPaidBookingRecord(store, paymentReference.trim());
}

/**
 * Claim a unique MAT-#### for this payment reference (retries on collision).
 */
export async function claimUniqueCustomerBookingReference(
  store: KVNamespace,
  paymentReference: string,
): Promise<string> {
  const paymentRef = paymentReference.trim();
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = generateCustomerBookingReference();
    const key = paidBookingCustomerRefKey(candidate);
    const existing = await store.get(key);
    if (existing && existing.trim() && existing.trim() !== paymentRef) {
      continue;
    }
    await store.put(key, paymentRef, { expirationTtl: RECORD_TTL });
    return candidate;
  }
  throw new Error("Could not allocate a unique customer booking reference");
}

/**
 * Ensure the record has a short MAT-#### and index. Persists when newly assigned.
 * Does not overwrite paymentReference / SumUp ids.
 */
export async function ensureCustomerBookingReference(
  store: KVNamespace,
  record: PaidBookingRecord,
): Promise<PaidBookingRecord> {
  const existing = normalizeCustomerBookingReference(record.customerReference ?? "");
  if (existing) {
    const indexed = await store.get(paidBookingCustomerRefKey(existing));
    if (!indexed?.trim()) {
      await store.put(paidBookingCustomerRefKey(existing), record.paymentReference, {
        expirationTtl: RECORD_TTL,
      });
    }
    if (record.customerReference !== existing) {
      const updated = { ...record, customerReference: existing };
      await savePaidBookingRecord(store, updated);
      return updated;
    }
    return record;
  }

  const customerReference = await claimUniqueCustomerBookingReference(
    store,
    record.paymentReference,
  );
  const updated = { ...record, customerReference };
  await savePaidBookingRecord(store, updated);
  return updated;
}

/**
 * Ensure the record has an opaque manage-booking token and KV index.
 * Metadata-only — does not consume free amendment quota.
 */
export async function ensureManageBookingToken(
  store: KVNamespace,
  record: PaidBookingRecord,
): Promise<PaidBookingRecord> {
  const existing = normalizeManageBookingToken(record.manageBookingToken ?? "");
  if (existing) {
    const indexed = await store.get(paidBookingManageTokenKey(existing));
    if (!indexed?.trim()) {
      await store.put(paidBookingManageTokenKey(existing), record.paymentReference, {
        expirationTtl: RECORD_TTL,
      });
    }
    if (record.manageBookingToken !== existing) {
      const updated = { ...record, manageBookingToken: existing };
      await savePaidBookingRecord(store, updated);
      return updated;
    }
    return record;
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const token = generateManageBookingToken();
    const key = paidBookingManageTokenKey(token);
    const claimed = await store.get(key);
    if (claimed && claimed.trim() && claimed.trim() !== record.paymentReference) {
      continue;
    }
    await store.put(key, record.paymentReference, { expirationTtl: RECORD_TTL });
    const updated = { ...record, manageBookingToken: token };
    await savePaidBookingRecord(store, updated);
    return updated;
  }
  throw new Error("Could not allocate a unique manage booking token");
}

export async function getPaidBookingRecordByManageToken(
  store: KVNamespace,
  token: string,
): Promise<PaidBookingRecord | null> {
  const normalized = normalizeManageBookingToken(token);
  if (!normalized) return null;
  const paymentReference = await store.get(paidBookingManageTokenKey(normalized));
  if (!paymentReference?.trim()) return null;
  return getPaidBookingRecord(store, paymentReference.trim());
}

/**
 * Resolve a Manage Booking lookup key: prefer MAT-####, fall back to SumUp / payment ref.
 */
export async function resolvePaidBookingForCustomerLookup(
  store: KVNamespace,
  rawReference: string,
): Promise<PaidBookingRecord | null> {
  const trimmed = String(rawReference ?? "").trim();
  if (!trimmed) return null;

  const asCustomer = normalizeCustomerBookingReference(trimmed);
  if (asCustomer) {
    const byCustomer = await getPaidBookingRecordByCustomerReference(store, asCustomer);
    if (byCustomer) {
      return ensureCustomerBookingReference(store, byCustomer);
    }
  }

  const byPayment = await getPaidBookingRecord(store, trimmed);
  if (byPayment) {
    return ensureCustomerBookingReference(store, byPayment);
  }

  const upper = trimmed.toUpperCase();
  if (upper !== trimmed) {
    const byUpper = await getPaidBookingRecord(store, upper);
    if (byUpper) {
      return ensureCustomerBookingReference(store, byUpper);
    }
  }

  return null;
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
    .filter((record) => !isOwnerOperationalTestBooking(record))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/**
 * Paid bookings with payment createdAt on/after fromDay (London YMD).
 * Used for Owner financial totals — payment records only, not trip-card visibility.
 */
export async function listPaidBookingsCreatedSince(
  store: KVNamespace,
  fromDay: string,
  options?: { limit?: number },
): Promise<PaidBookingRecord[]> {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(fromDay) ? fromDay : addDaysYmd(londonToday(), -366);
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 800);
  const byRef = new Map<string, PaidBookingRecord>();
  const today = londonToday();

  let cursor = today;
  let guard = 0;
  while (cursor >= start && guard < 400) {
    const ids = await store.get<string[]>(paidBookingCreatedDayIndexKey(cursor), "json");
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (!id?.trim() || byRef.has(id)) continue;
        const record = await getPaidBookingRecord(store, id);
        if (record) byRef.set(record.paymentReference, record);
      }
    }
    if (cursor === start) break;
    cursor = addDaysYmd(cursor, -1);
    guard += 1;
  }

  // Fallback scan for pre-index rows still within the year window.
  if (byRef.size < limit) {
    let listCursor: string | undefined;
    do {
      const page = await store.list({ prefix: "booking:ref:", cursor: listCursor, limit: 100 });
      for (const key of page.keys) {
        const ref = key.name.replace(/^booking:ref:/, "").trim();
        if (!ref || byRef.has(ref)) continue;
        const record = await getPaidBookingRecord(store, ref);
        if (!record?.createdAt) continue;
        const createdDay = londonDateFromIso(record.createdAt);
        if (createdDay < start) continue;
        byRef.set(record.paymentReference, record);
      }
      listCursor = page.list_complete ? undefined : page.cursor;
    } while (listCursor && byRef.size < limit);
  }

  return [...byRef.values()]
    .filter((record) => !isOwnerOperationalTestBooking(record))
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
  const pastDays = Math.min(Math.max(options?.pastDays ?? 2, 0), 120);
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
    .filter((record) => !isOwnerOperationalTestBooking(record))
    .filter((record) => bookingInUpcomingHorizon(record, horizonStart, horizonEnd))
    .sort((a, b) => tripSortKey(a).localeCompare(tripSortKey(b)))
    .slice(0, limit);
}

/**
 * Paid bookings whose outbound trip date or return date falls in [fromYmd, toYmd].
 * Uses the trip-day index (not payment createdAt) so a booking made months
 * earlier still appears when its journey date is checked.
 */
export async function listPaidBookingsForTripRange(
  store: KVNamespace,
  fromYmd: string,
  toYmd: string,
  options?: { limit?: number },
): Promise<PaidBookingRecord[]> {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromYmd) ? fromYmd : londonToday();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toYmd) ? toYmd : from;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const limit = Math.min(Math.max(options?.limit ?? 250, 1), 400);
  const byRef = new Map<string, PaidBookingRecord>();

  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 420) {
    const ids = await store.get<string[]>(paidBookingTripDayIndexKey(cursor), "json");
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (!id?.trim() || byRef.has(id)) continue;
        const record = await getPaidBookingRecord(store, id);
        if (record) byRef.set(record.paymentReference, record);
      }
    }
    if (cursor === end) break;
    cursor = addDaysYmd(cursor, 1);
    guard += 1;
  }

  return [...byRef.values()]
    .filter((record) => !isOwnerOperationalTestBooking(record))
    .filter((record) => bookingInUpcomingHorizon(record, start, end))
    .sort((a, b) => tripSortKey(a).localeCompare(tripSortKey(b)))
    .slice(0, limit);
}

/** Owner-only list of live £1 SumUp refund-test paid bookings (newest first). */
export async function listRefundTestPaidBookings(
  store: KVNamespace,
  options?: { limit?: number },
): Promise<PaidBookingRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  const ids = await store.get<string[]>(paidBookingRefundTestIndexKey(), "json");
  const byRef = new Map<string, PaidBookingRecord>();

  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (!id?.trim() || byRef.has(id)) continue;
      const record = await getPaidBookingRecord(store, id);
      if (record?.isRefundTest) byRef.set(record.paymentReference, record);
    }
  }

  // Fallback scan if index empty / incomplete.
  if (byRef.size < limit) {
    let cursor: string | undefined;
    do {
      const page = await store.list({ prefix: "booking:ref:", cursor, limit: 100 });
      for (const key of page.keys) {
        const ref = key.name.replace(/^booking:ref:/, "").trim();
        if (!ref || byRef.has(ref)) continue;
        const record = await getPaidBookingRecord(store, ref);
        if (record?.isRefundTest) byRef.set(record.paymentReference, record);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor && byRef.size < limit * 2);
  }

  return [...byRef.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/** Owner-only list of same-fare amendment test fixtures (newest first). */
export async function listAmendmentTestPaidBookings(
  store: KVNamespace,
  options?: { limit?: number },
): Promise<PaidBookingRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const ids = await store.get<string[]>(paidBookingAmendmentTestIndexKey(), "json");
  const byRef = new Map<string, PaidBookingRecord>();

  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (!id?.trim() || byRef.has(id)) continue;
      const record = await getPaidBookingRecord(store, id);
      if (record?.isAmendmentTestFixture) byRef.set(record.paymentReference, record);
    }
  }

  if (byRef.size < limit) {
    let cursor: string | undefined;
    do {
      const page = await store.list({ prefix: "booking:ref:", cursor, limit: 100 });
      for (const key of page.keys) {
        const ref = key.name.replace(/^booking:ref:/, "").trim();
        if (!ref || byRef.has(ref)) continue;
        const record = await getPaidBookingRecord(store, ref);
        if (record?.isAmendmentTestFixture) {
          byRef.set(record.paymentReference, record);
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor && byRef.size < limit * 2);
  }

  return [...byRef.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/**
 * Payment refs for confirmed return bookings whose returnDate falls in [fromDate, toDate].
 * Used to seed return-leg tracking backfill for SumUp-only bookings (no booking-job row).
 */
export async function listPaymentRefsWithReturnDateInRange(
  store: KVNamespace,
  fromDate: string,
  toDate: string,
): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return [];
  }

  const refs: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await store.list({ prefix: "booking:ref:", cursor, limit: 100 });
    for (const key of page.keys) {
      const ref = key.name.replace(/^booking:ref:/, "").trim();
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      const record = await getPaidBookingRecord(store, ref);
      if (!record || record.status === "refunded" || record.status === "cancelled") continue;
      if (!record.returnJourney) continue;
      const returnDate = record.returnDate?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) continue;
      if (returnDate < fromDate || returnDate > toDate) continue;
      if (!record.returnTime?.trim()) continue;
      refs.push(record.paymentReference);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return refs;
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
    | "originalTripDate"
    | "originalTripTime"
    | "dateTimeAmendmentCount"
    | "dateTimeAmendmentHistory"
    | "originalAmount"
    | "additionalPayments"
    | "amendmentHistory"
    | "pendingAmendment"
    | "amount"
    | "amountPaidLabel"
    | "amountRefunded"
    | "refundDueAmount"
    | "refundDueReason"
    | "refundDueAt"
    | "lastUpdatedConfirmationSentAt"
    | "lastUpdatedConfirmationError"
    | "lastUpdatedConfirmationAmendmentId"
    | "airportCode"
    | "isFromAirport"
    | "isAirportTrip"
    | "dublinArrivalTerminal"
    | "dublinArrivalTerminalSource"
    | "returnDublinArrivalTerminal"
    | "returnDublinArrivalTerminalSource"
    | "journeyDistance"
    | "journeyDuration"
    | "paymentStatus"
  >
>;

function auditValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

export async function updatePaidBookingFields(
  store: KVNamespace,
  paymentReference: string,
  fields: PaidBookingUpdateFields,
  options?: { appendAudit?: boolean; changedBy?: "Owner" | "Customer" | "System" },
): Promise<PaidBookingRecord | null> {
  const record = await getPaidBookingRecord(store, paymentReference);
  if (!record || record.status === "refunded" || record.status === "cancelled") {
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
      if (
        field === "dateTimeAmendmentHistory" ||
        field === "dateTimeAmendmentCount" ||
        field === "amendmentHistory" ||
        field === "pendingAmendment" ||
        field === "additionalPayments"
      ) {
        continue;
      }
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
