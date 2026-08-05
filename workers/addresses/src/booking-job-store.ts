import {
  bookingJobDayIndexKey,
  bookingJobKey,
  driverAcceptKey,
  type BookingJobRecord,
} from "../shared/booking-job";

const DAY_INDEX_TTL = 60 * 60 * 24 * 90;
const ACCEPT_TTL = 60 * 60 * 24 * 60;

export function bookingJobStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

export async function saveBookingJob(
  store: KVNamespace,
  job: BookingJobRecord,
): Promise<void> {
  await store.put(bookingJobKey(job.id), JSON.stringify(job), {
    expirationTtl: DAY_INDEX_TTL,
  });

  if (job.tripDate?.trim()) {
    const indexKey = bookingJobDayIndexKey(job.tripDate);
    const existing = await store.get<string[]>(indexKey, "json");
    const ids = Array.isArray(existing) ? existing : [];
    if (!ids.includes(job.id)) {
      ids.push(job.id);
      await store.put(indexKey, JSON.stringify(ids), {
        expirationTtl: DAY_INDEX_TTL,
      });
    }
  }

  if (job.driverAcceptToken?.trim()) {
    await store.put(driverAcceptKey(job.driverAcceptToken), job.id, {
      expirationTtl: ACCEPT_TTL,
    });
  }
}

export async function getBookingJob(
  store: KVNamespace,
  id: string,
): Promise<BookingJobRecord | null> {
  const job = await store.get<BookingJobRecord>(bookingJobKey(id), "json");
  return job && typeof job === "object" ? job : null;
}

export async function getBookingJobByAcceptToken(
  store: KVNamespace,
  token: string,
): Promise<BookingJobRecord | null> {
  const id = await store.get(driverAcceptKey(token));
  if (!id?.trim()) {
    return null;
  }
  return getBookingJob(store, id.trim());
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function listBookingJobsForDate(
  store: KVNamespace,
  tripDate: string,
): Promise<BookingJobRecord[]> {
  const ids = await store.get<string[]>(bookingJobDayIndexKey(tripDate), "json");
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const jobs: BookingJobRecord[] = [];
  for (const id of ids) {
    const job = await getBookingJob(store, id);
    if (job) {
      jobs.push(job);
    }
  }
  return jobs;
}

export async function listBookingJobsForDateRange(
  store: KVNamespace,
  fromDate: string,
  toDate: string,
): Promise<BookingJobRecord[]> {
  const jobs: BookingJobRecord[] = [];
  let cursor = fromDate;
  // Safety cap: 90 days
  for (let i = 0; i < 90; i++) {
    const dayJobs = await listBookingJobsForDate(store, cursor);
    jobs.push(...dayJobs);
    if (cursor >= toDate) {
      break;
    }
    cursor = addDays(cursor, 1);
  }

  // Also include recently created jobs that may have missing/empty trip dates by scanning nearby days is enough.
  return jobs.sort((a, b) => {
    const aKey = `${a.tripDate}T${a.tripTime}`;
    const bKey = `${b.tripDate}T${b.tripTime}`;
    return aKey.localeCompare(bKey);
  });
}

export function generateDriverAcceptToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
