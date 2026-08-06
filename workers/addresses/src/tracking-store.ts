import {
  buildPickupDateTimeLocal,
  generateTrackingToken,
  type DriverLocationPoint,
  type TrackingJobRecord,
} from "../shared/tracking";
import type { PaidBookingDetails } from "../shared/booking-notifications";

const JOB_PREFIX = "track:job:";
const DAY_INDEX_PREFIX = "track:day:";
const REF_INDEX_PREFIX = "track:ref:";
const DRIVER_HISTORY_PREFIX = "track:driver-history:";
const DAY_INDEX_TTL = 60 * 60 * 24 * 45;
/** Retain driver GPS audit trail for 1 year */
const DRIVER_HISTORY_TTL = 60 * 60 * 24 * 365;
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

async function readPaymentReferenceTokens(
  store: KVNamespace,
  paymentReference: string,
): Promise<string[]> {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return [];
  }

  const existing = await store.get(refIndexKey(trimmed));
  if (!existing?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(existing) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((token) => String(token).trim()).filter(Boolean);
    }
  } catch {
    // Legacy single-token string index
  }

  return [existing.trim()];
}

async function indexTrackingJobPaymentReference(
  store: KVNamespace,
  paymentReference: string,
  token: string,
): Promise<void> {
  const trimmed = paymentReference.trim();
  if (!trimmed || !token.trim()) {
    return;
  }

  const tokens = await readPaymentReferenceTokens(store, trimmed);
  if (!tokens.includes(token)) {
    tokens.push(token);
  }

  await store.put(refIndexKey(trimmed), JSON.stringify(tokens), {
    expirationTtl: DAY_INDEX_TTL,
  });
}

async function indexTrackingJobOnDay(
  store: KVNamespace,
  tripDate: string,
  token: string,
): Promise<void> {
  const indexKey = dayIndexKey(tripDate);
  const existing = await store.get<string[]>(indexKey, "json");
  const tokens = Array.isArray(existing) ? existing : [];
  if (!tokens.includes(token)) {
    tokens.push(token);
    await store.put(indexKey, JSON.stringify(tokens), {
      expirationTtl: DAY_INDEX_TTL,
    });
  }
}

export function trackingStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

type TrackingLegOptions = {
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  flightNumber?: string;
  isFromAirport?: boolean;
  journeyLeg: "outbound" | "return";
  pairedToken?: string;
};

async function createTrackingLegRecord(
  store: KVNamespace,
  booking: PaidBookingDetails,
  paymentReference: string | undefined,
  leg: TrackingLegOptions,
): Promise<TrackingJobRecord | null> {
  const pickupAt = buildPickupDateTimeLocal(leg.tripDate, leg.tripTime);
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
    pickupLabel: leg.pickupLabel,
    dropoffLabel: leg.dropoffLabel,
    tripDate: leg.tripDate,
    tripTime: leg.tripTime,
    pickupAt,
    paymentReference,
    journeyLeg: leg.journeyLeg,
    pairedToken: leg.pairedToken,
    sharingActive: false,
  };

  if (booking.isAirportTrip) {
    record.isAirportTrip = true;
    if (booking.airportCode?.trim()) {
      record.airportCode = booking.airportCode.trim().toUpperCase();
    }
    if (typeof leg.isFromAirport === "boolean") {
      record.isFromAirport = leg.isFromAirport;
    } else if (typeof booking.isFromAirport === "boolean") {
      record.isFromAirport = booking.isFromAirport;
    }
    if (leg.flightNumber?.trim()) {
      record.flightNumber = leg.flightNumber.trim().toUpperCase();
    }
  }

  if (booking.termsAcceptedAt?.trim()) {
    record.termsAcceptedAt = booking.termsAcceptedAt.trim();
  }
  if (booking.termsVersion?.trim()) {
    record.termsVersion = booking.termsVersion.trim();
  }

  if (booking.marketingOptIn) {
    record.marketingOptIn = true;
    if (booking.marketingOptInAt?.trim()) {
      record.marketingOptInAt = booking.marketingOptInAt.trim();
    }
    if (booking.marketingConsentVersion?.trim()) {
      record.marketingConsentVersion = booking.marketingConsentVersion.trim();
    }
  }

  await store.put(jobKey(token), JSON.stringify(record), {
    expirationTtl: DAY_INDEX_TTL,
  });
  await indexTrackingJobOnDay(store, leg.tripDate, token);

  if (paymentReference?.trim()) {
    await indexTrackingJobPaymentReference(store, paymentReference, token);
  }

  return record;
}

function isReturnLegJob(job: TrackingJobRecord, booking: PaidBookingDetails): boolean {
  if (job.journeyLeg === "return") {
    return true;
  }
  if (job.journeyLeg === "outbound") {
    return false;
  }
  // Legacy jobs: treat a same-day match on the return date with swapped addresses as return.
  return (
    Boolean(booking.returnDate?.trim()) &&
    job.tripDate === booking.returnDate?.trim() &&
    job.pickupLabel.trim().toLowerCase() === booking.dropoffLabel.trim().toLowerCase()
  );
}

/**
 * Create outbound (+ return) tracking jobs for a paid booking.
 * Idempotent: skips legs that already exist for the payment reference.
 */
export async function createTrackingJobFromBooking(
  store: KVNamespace,
  booking: PaidBookingDetails,
  paymentReference?: string,
): Promise<TrackingJobRecord | null> {
  const paymentRef = paymentReference?.trim() || undefined;
  const existing = paymentRef
    ? await findTrackingJobsByPaymentReference(store, paymentRef)
    : [];

  let outbound =
    existing.find((job) => !isReturnLegJob(job, booking)) ??
    null;

  if (!outbound) {
    outbound = await createTrackingLegRecord(store, booking, paymentRef, {
      tripDate: booking.tripDate,
      tripTime: booking.tripTime,
      pickupLabel: booking.pickupLabel,
      dropoffLabel: booking.dropoffLabel,
      flightNumber: booking.flightNumber,
      isFromAirport: booking.isFromAirport,
      journeyLeg: "outbound",
    });
  } else if (!outbound.journeyLeg) {
    outbound.journeyLeg = "outbound";
    await saveTrackingJob(store, outbound);
  }

  if (!outbound) {
    return null;
  }

  const returnDate = booking.returnDate?.trim() || "";
  const returnTime = booking.returnTime?.trim() || "";
  if (booking.returnJourney && returnDate && returnTime) {
    let returnJob =
      existing.find((job) => isReturnLegJob(job, booking)) ??
      null;

    if (!returnJob) {
      const dayJobs = await listTrackingJobsForDate(store, returnDate);
      returnJob =
        dayJobs.find(
          (job) =>
            (paymentRef && job.paymentReference?.trim() === paymentRef) ||
            (job.customerName.trim().toLowerCase() === booking.customerName.trim().toLowerCase() &&
              job.pickupLabel.trim().toLowerCase() === booking.dropoffLabel.trim().toLowerCase() &&
              job.tripTime === returnTime),
        ) ?? null;
    }

    if (!returnJob) {
      const returnIsFromAirport =
        typeof booking.isFromAirport === "boolean" ? !booking.isFromAirport : undefined;
      returnJob = await createTrackingLegRecord(store, booking, paymentRef, {
        tripDate: returnDate,
        tripTime: returnTime,
        pickupLabel: booking.dropoffLabel,
        dropoffLabel: booking.pickupLabel,
        flightNumber: booking.returnFlightNumber || undefined,
        isFromAirport: returnIsFromAirport,
        journeyLeg: "return",
        pairedToken: outbound.token,
      });
    }

    if (returnJob) {
      let dirty = false;
      if (returnJob.journeyLeg !== "return") {
        returnJob.journeyLeg = "return";
        dirty = true;
      }
      if (returnJob.pairedToken !== outbound.token) {
        returnJob.pairedToken = outbound.token;
        dirty = true;
      }
      if (dirty) {
        await saveTrackingJob(store, returnJob);
      }

      if (outbound.pairedToken !== returnJob.token || outbound.journeyLeg !== "outbound") {
        outbound.pairedToken = returnJob.token;
        outbound.journeyLeg = "outbound";
        await saveTrackingJob(store, outbound);
      }
    }
  }

  return outbound;
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

export async function findTrackingJobsByPaymentReference(
  store: KVNamespace,
  paymentReference: string,
): Promise<TrackingJobRecord[]> {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return [];
  }

  const tokens = await readPaymentReferenceTokens(store, trimmed);
  const fromIndex: TrackingJobRecord[] = [];
  for (const token of tokens) {
    const job = await getTrackingJob(store, token);
    if (job?.paymentReference?.trim() === trimmed) {
      fromIndex.push(job);
    }
  }

  if (fromIndex.length > 0) {
    return fromIndex;
  }

  const today = londonDateString(new Date());
  const fromDate = shiftDateString(today, -PAYMENT_REF_SEARCH_DAYS_BACK);
  const toDate = shiftDateString(today, PAYMENT_REF_SEARCH_DAYS_AHEAD);
  const jobs = await listTrackingJobsForDateRange(store, fromDate, toDate);
  const matches = jobs.filter((job) => job.paymentReference?.trim() === trimmed);

  for (const match of matches) {
    await indexTrackingJobPaymentReference(store, trimmed, match.token);
  }

  return matches;
}

export async function findTrackingJobByPaymentReference(
  store: KVNamespace,
  paymentReference: string,
): Promise<TrackingJobRecord | null> {
  const matches = await findTrackingJobsByPaymentReference(store, paymentReference);
  if (matches.length === 0) {
    return null;
  }

  return (
    matches.find((job) => job.journeyLeg !== "return") ??
    matches[0] ??
    null
  );
}

export async function cancelTrackingJob(store: KVNamespace, token: string): Promise<boolean> {
  const record = await getTrackingJob(store, token);
  if (!record) {
    return false;
  }

  await store.delete(jobKey(token));

  if (record.paymentReference?.trim()) {
    const remaining = (await readPaymentReferenceTokens(store, record.paymentReference)).filter(
      (entry) => entry !== token,
    );
    if (remaining.length === 0) {
      await store.delete(refIndexKey(record.paymentReference));
    } else {
      await store.put(refIndexKey(record.paymentReference), JSON.stringify(remaining), {
        expirationTtl: DAY_INDEX_TTL,
      });
    }
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

export function isTrackingJobCancelled(record: TrackingJobRecord): boolean {
  return Boolean(record.refundedAt?.trim());
}

export async function markTrackingJobRefunded(
  store: KVNamespace,
  token: string,
  refundAmountLabel?: string,
): Promise<boolean> {
  const record = await getTrackingJob(store, token);
  if (!record) {
    return false;
  }

  const related = record.paymentReference?.trim()
    ? await findTrackingJobsByPaymentReference(store, record.paymentReference)
    : [record];

  const tokens = new Set<string>([token, ...related.map((job) => job.token)]);
  if (record.pairedToken?.trim()) {
    tokens.add(record.pairedToken.trim());
  }

  let marked = false;
  const refundedAt = new Date().toISOString();
  for (const relatedToken of tokens) {
    const job = await getTrackingJob(store, relatedToken);
    if (!job) {
      continue;
    }
    const updated: TrackingJobRecord = {
      ...job,
      sharingActive: false,
      customerSharingActive: false,
      refundedAt,
      ...(refundAmountLabel?.trim() ? { refundAmountLabel: refundAmountLabel.trim() } : {}),
    };
    await saveTrackingJob(store, updated);
    marked = true;
  }

  return marked;
}

function driverHistoryKey(token: string): string {
  return `${DRIVER_HISTORY_PREFIX}${token}`;
}

export async function appendDriverLocationPoint(
  store: KVNamespace,
  token: string,
  point: DriverLocationPoint,
): Promise<number> {
  const key = driverHistoryKey(token);
  const existing = await store.get<DriverLocationPoint[]>(key, "json");
  const history = Array.isArray(existing) ? existing : [];
  history.push(point);
  await store.put(key, JSON.stringify(history), {
    expirationTtl: DRIVER_HISTORY_TTL,
  });
  return history.length;
}

export async function getDriverLocationHistory(
  store: KVNamespace,
  token: string,
): Promise<DriverLocationPoint[]> {
  const history = await store.get<DriverLocationPoint[]>(driverHistoryKey(token), "json");
  return Array.isArray(history) ? history : [];
}
