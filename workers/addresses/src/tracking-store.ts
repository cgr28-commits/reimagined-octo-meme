import {
  buildPickupDateTimeLocal,
  generateTrackingToken,
  type TrackingJobRecord,
} from "../shared/tracking";
import type { PaidBookingDetails } from "../shared/booking-notifications";

const JOB_PREFIX = "track:job:";
const DAY_INDEX_PREFIX = "track:day:";

function jobKey(token: string): string {
  return `${JOB_PREFIX}${token}`;
}

function dayIndexKey(tripDate: string): string {
  return `${DAY_INDEX_PREFIX}${tripDate}`;
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
    expirationTtl: 60 * 60 * 24 * 45,
  });

  const indexKey = dayIndexKey(booking.tripDate);
  const existing = await store.get<string[]>(indexKey, "json");
  const tokens = Array.isArray(existing) ? existing : [];
  if (!tokens.includes(token)) {
    tokens.push(token);
    await store.put(indexKey, JSON.stringify(tokens), {
      expirationTtl: 60 * 60 * 24 * 45,
    });
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
    expirationTtl: 60 * 60 * 24 * 45,
  });
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
