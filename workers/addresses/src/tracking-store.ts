import {
  buildPickupDateTimeLocal,
  generateTrackingToken,
  type TrackingJobRecord,
} from "../shared/tracking";
import type { PaidBookingDetails } from "../shared/booking-notifications";

const JOB_PREFIX = "track:job:";
const DAY_INDEX_PREFIX = "track:day:";
const REF_INDEX_PREFIX = "track:ref:";
const DAY_INDEX_TTL = 60 * 60 * 24 * 45;
const PAYMENT_REF_SEARCH_DAYS_BACK = 45;
const PAYMENT_REF_SEARCH_DAYS_AHEAD = 60;

function jobKey(token: string): string {
  return `${JOB_PREFIX}${token}`;
}

function dayIndexKey(tripDate: string): string {
  return `${DAY_INDEX_PREFIX}${tripDate}`;
}

function refIndexKey(paymentReference: string): string {
  return `${REF_INDEX_PREFIX}${paymentReference.trim()}`;
}

async function indexTrackingJobPaymentReference(
  store: KVNamespace,
  paymentReference: string,
  token: string,
): Promise<void> {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return;
  }

  await store.put(refIndexKey(trimmed), token, {
    expirationTtl: DAY_INDEX_TTL,
  });
}

export function trackingStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

export async function createTrackingJobFromBooking(
  store: KVNamespace,
  booking: PaidBookingDetails,
  paymentReference?: string,
): Promise<TrackingJobRecord | null> {
  const pickupAt = buildPickupDateTimeLocal(booking.tripDate, booking.tripTime);
  if (!pickupAt) {
    return null;
  }

  const token = generateTrackingToken();
  const record: TrackingJobRecord = {
    token,
    createdAt: new Date().toISOString(),
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerMobile: booking.mobileNumber,
    pickupLabel: booking.pickupLabel,
    dropoffLabel: booking.dropoffLabel,
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
    pickupAt,
    paymentReference,
    sharingActive: false,
  };

  if (booking.isAirportTrip) {
    record.isAirportTrip = true;
    if (booking.airportCode?.trim()) {
      record.airportCode = booking.airportCode.trim().toUpperCase();
    }
    if (typeof booking.isFromAirport === "boolean") {
      record.isFromAirport = booking.isFromAirport;
    }
    if (booking.flightNumber?.trim()) {
      record.flightNumber = booking.flightNumber.trim().toUpperCase();
    }
  }

  if (booking.termsAcceptedAt?.trim()) {
    record.termsAcceptedAt = booking.termsAcceptedAt.trim();
  }
  if (booking.termsVersion?.trim()) {
    record.termsVersion = booking.termsVersion.trim();
  }

  await store.put(jobKey(token), JSON.stringify(record), {
    expirationTtl: DAY_INDEX_TTL,
  });

  const indexKey = dayIndexKey(booking.tripDate);
  const existing = await store.get<string[]>(indexKey, "json");
  const tokens = Array.isArray(existing) ? existing : [];
  if (!tokens.includes(token)) {
    tokens.push(token);
    await store.put(indexKey, JSON.stringify(tokens), {
      expirationTtl: DAY_INDEX_TTL,
    });
  }

  if (paymentReference?.trim()) {
    await indexTrackingJobPaymentReference(store, paymentReference, token);
  }

  return record;
}

export async function getTrackingJob(
  store: KVNamespace,
  token: string,
): Promise<TrackingJobRecord | null> {
  const record = await store.get<TrackingJobRecord>(jobKey(token), "json");
  if (!record?.token) {
    return null;
  }

  return record;
}

export async function saveTrackingJob(
  store: KVNamespace,
  record: TrackingJobRecord,
): Promise<void> {
  await store.put(jobKey(record.token), JSON.stringify(record), {
    expirationTtl: DAY_INDEX_TTL,
  });

  if (record.paymentReference?.trim()) {
    await indexTrackingJobPaymentReference(store, record.paymentReference, record.token);
  }
}

export async function reindexTrackingJobDate(
  store: KVNamespace,
  token: string,
  oldDate: string,
  newDate: string,
): Promise<void> {
  if (oldDate === newDate) {
    return;
  }

  const oldTokens = await store.get<string[]>(dayIndexKey(oldDate), "json");
  if (Array.isArray(oldTokens)) {
    const filtered = oldTokens.filter((entry) => entry !== token);
    if (filtered.length === 0) {
      await store.delete(dayIndexKey(oldDate));
    } else {
      await store.put(dayIndexKey(oldDate), JSON.stringify(filtered), {
        expirationTtl: DAY_INDEX_TTL,
      });
    }
  }

  const newTokens = await store.get<string[]>(dayIndexKey(newDate), "json");
  const merged = Array.isArray(newTokens) ? newTokens : [];
  if (!merged.includes(token)) {
    merged.push(token);
    await store.put(dayIndexKey(newDate), JSON.stringify(merged), {
      expirationTtl: DAY_INDEX_TTL,
    });
  }
}

export async function listTrackingJobsForDate(
  store: KVNamespace,
  tripDate: string,
): Promise<TrackingJobRecord[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
    return [];
  }

  const tokens = await store.get<string[]>(dayIndexKey(tripDate), "json");
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }

  const jobs = await Promise.all(tokens.map((token) => getTrackingJob(store, token)));
  return jobs
    .filter((job): job is TrackingJobRecord => Boolean(job))
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
}

function londonDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDateString(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export async function listTrackingJobsForDateRange(
  store: KVNamespace,
  fromDate: string,
  toDate: string,
): Promise<TrackingJobRecord[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return [];
  }

  if (fromDate > toDate) {
    return [];
  }

  const jobs: TrackingJobRecord[] = [];
  let cursor = fromDate;

  while (cursor <= toDate) {
    const dayJobs = await listTrackingJobsForDate(store, cursor);
    jobs.push(...dayJobs);
    cursor = shiftDateString(cursor, 1);
  }

  return jobs.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
}

export async function listUpcomingTrackingJobs(
  store: KVNamespace,
  daysAhead = 60,
): Promise<TrackingJobRecord[]> {
  const today = londonDateString(new Date());
  const end = shiftDateString(today, Math.max(0, daysAhead));
  return listTrackingJobsForDateRange(store, today, end);
}

export async function listTrackingJobsForRecentDays(
  store: KVNamespace,
  daysBack: number,
): Promise<TrackingJobRecord[]> {
  const today = londonDateString(new Date());
  const jobs: TrackingJobRecord[] = [];

  for (let offset = 0; offset <= daysBack; offset += 1) {
    const tripDate = shiftDateString(today, -offset);
    const dayJobs = await listTrackingJobsForDate(store, tripDate);
    jobs.push(...dayJobs);
  }

  return jobs;
}

export async function findTrackingJobByPaymentReference(
  store: KVNamespace,
  paymentReference: string,
): Promise<TrackingJobRecord | null> {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return null;
  }

  const indexedToken = await store.get(refIndexKey(trimmed));
  if (indexedToken) {
    const indexedJob = await getTrackingJob(store, indexedToken);
    if (indexedJob?.paymentReference?.trim() === trimmed) {
      return indexedJob;
    }
  }

  const today = londonDateString(new Date());
  const fromDate = shiftDateString(today, -PAYMENT_REF_SEARCH_DAYS_BACK);
  const toDate = shiftDateString(today, PAYMENT_REF_SEARCH_DAYS_AHEAD);
  const jobs = await listTrackingJobsForDateRange(store, fromDate, toDate);
  const match = jobs.find((job) => job.paymentReference?.trim() === trimmed) ?? null;

  if (match) {
    await indexTrackingJobPaymentReference(store, trimmed, match.token);
  }

  return match;
}

export async function cancelTrackingJob(store: KVNamespace, token: string): Promise<boolean> {
  const record = await getTrackingJob(store, token);
  if (!record) {
    return false;
  }

  await store.delete(jobKey(token));

  if (record.paymentReference?.trim()) {
    await store.delete(refIndexKey(record.paymentReference));
  }

  const indexKey = dayIndexKey(record.tripDate);
  const existing = await store.get<string[]>(indexKey, "json");
  if (Array.isArray(existing)) {
    const tokens = existing.filter((entry) => entry !== token);
    if (tokens.length === 0) {
      await store.delete(indexKey);
    } else {
      await store.put(indexKey, JSON.stringify(tokens), {
        expirationTtl: DAY_INDEX_TTL,
      });
    }
  }

  return true;
}
