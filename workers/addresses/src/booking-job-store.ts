import {
  bookingJobCreatedDayIndexKey,
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
  jobId: string,
): Promise<void> {
  const existing = await store.get<string[]>(indexKey, "json");
  const ids = Array.isArray(existing) ? existing : [];
  if (!ids.includes(jobId)) {
    ids.push(jobId);
    await store.put(indexKey, JSON.stringify(ids), {
      expirationTtl: DAY_INDEX_TTL,
    });
  }
}

export async function saveBookingJob(
  store: KVNamespace,
  job: BookingJobRecord,
): Promise<void> {
  await store.put(bookingJobKey(job.id), JSON.stringify(job), {
    expirationTtl: DAY_INDEX_TTL,
  });

  if (job.tripDate?.trim()) {
    await addIdToDayIndex(store, bookingJobDayIndexKey(job.tripDate), job.id);
  }

  if (job.createdAt?.trim()) {
    await addIdToDayIndex(
      store,
      bookingJobCreatedDayIndexKey(londonDateFromIso(job.createdAt)),
      job.id,
    );
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

async function listBookingJobsForIndexKey(
  store: KVNamespace,
  indexKey: string,
): Promise<BookingJobRecord[]> {
  const ids = await store.get<string[]>(indexKey, "json");
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

export async function listBookingJobsForDate(
  store: KVNamespace,
  tripDate: string,
): Promise<BookingJobRecord[]> {
  return listBookingJobsForIndexKey(store, bookingJobDayIndexKey(tripDate));
}

export async function listBookingJobsForCreatedDate(
  store: KVNamespace,
  createdDate: string,
): Promise<BookingJobRecord[]> {
  return listBookingJobsForIndexKey(store, bookingJobCreatedDayIndexKey(createdDate));
}

/** List every stored booking-job record (skips day-index keys). */
export async function listAllBookingJobs(
  store: KVNamespace,
): Promise<BookingJobRecord[]> {
  const jobs: BookingJobRecord[] = [];
  let cursor: string | undefined;

  for (let pageNum = 0; pageNum < 20; pageNum++) {
    const page = await store.list({
      prefix: "booking-job:",
      limit: 100,
      cursor,
    });

    for (const key of page.keys) {
      const job = await store.get<BookingJobRecord>(key.name, "json");
      if (job && typeof job === "object" && typeof job.id === "string" && job.id) {
        jobs.push(job);
      }
    }

    if (page.list_complete) {
      break;
    }
    cursor = page.cursor;
  }

  return jobs;
}

export async function listBookingJobsForDateRange(
  store: KVNamespace,
  fromDate: string,
  toDate: string,
  options?: { createdFrom?: string; createdTo?: string },
): Promise<BookingJobRecord[]> {
  const createdFrom = options?.createdFrom?.trim() || "";
  const createdTo = options?.createdTo?.trim() || "";

  // Prefer a full key listing so jobs are not lost when a day index is missing
  // (older saves, race on first write, or tripDate outside the window).
  const all = await listAllBookingJobs(store);
  const filtered = all.filter((job) => {
    const tripDate = job.tripDate?.trim() || "";
    if (tripDate && tripDate >= fromDate && tripDate <= toDate) {
      return true;
    }
    if (createdFrom && createdTo && job.createdAt) {
      const createdDay = londonDateFromIso(job.createdAt);
      if (createdDay >= createdFrom && createdDay <= createdTo) {
        return true;
      }
    }
    return false;
  });

  if (filtered.length > 0 || all.length > 0) {
    return filtered.sort((a, b) => {
      const aKey = `${a.tripDate}T${a.tripTime}`;
      const bKey = `${b.tripDate}T${b.tripTime}`;
      return aKey.localeCompare(bKey);
    });
  }

  // Fallback to day indexes if the namespace has no direct booking-job:* keys yet
  const byId = new Map<string, BookingJobRecord>();
  let cursor = fromDate;
  for (let i = 0; i < 90; i++) {
    for (const job of await listBookingJobsForDate(store, cursor)) {
      byId.set(job.id, job);
    }
    if (cursor >= toDate) {
      break;
    }
    cursor = addDays(cursor, 1);
  }

  if (createdFrom && createdTo) {
    let createdCursor = createdFrom;
    for (let i = 0; i < 60; i++) {
      for (const job of await listBookingJobsForCreatedDate(store, createdCursor)) {
        byId.set(job.id, job);
      }
      if (createdCursor >= createdTo) {
        break;
      }
      createdCursor = addDays(createdCursor, 1);
    }
  }

  return [...byId.values()].sort((a, b) => {
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
