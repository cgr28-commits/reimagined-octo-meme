import {
  DEMO_DRIVER_KEY,
  getDemoDriverJobs,
  getDemoDriverUpcomingJobs,
  getDemoTrackResponse,
  isDemoTrackToken,
} from "@/lib/tracking-demo";

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function resolveWorkerBaseUrl(): string {
  const bookingsUrl = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!bookingsUrl) {
    return DEFAULT_WORKER_BASE;
  }

  try {
    const parsed = new URL(bookingsUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return DEFAULT_WORKER_BASE;
    }

    return bookingsUrl.replace(/\/bookings\/?$/i, "");
  } catch {
    return DEFAULT_WORKER_BASE;
  }
}

const WORKER_BASE = resolveWorkerBaseUrl();

function driverQueryKey(url: URL, driverKey: string): void {
  url.searchParams.set("key", driverKey.trim());
}

function driverPostHeaders(driverKey: string): HeadersInit {
  const trimmed = driverKey.trim();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Driver-Key": trimmed,
  };
}

export type DriverStatusResponse = {
  ok: boolean;
  authConfigured: boolean;
  hasDriverKey?: boolean;
  hasOwnerKey?: boolean;
  role?: "owner" | "driver";
  driverName?: string;
  availableDrivers?: string[];
  worker: string;
  error?: string;
};

export async function fetchDriverStatus(driverKey: string): Promise<DriverStatusResponse> {
  if (driverKey === DEMO_DRIVER_KEY) {
    return { ok: true, authConfigured: true, worker: "demo" };
  }

  const url = new URL(`${WORKER_BASE}/driver/status`);
  driverQueryKey(url, driverKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as DriverStatusResponse | null;
  if (!payload) {
    throw new Error(`Driver access check failed (${response.status})`);
  }

  return payload;
}

export async function verifyDriverAccessKey(
  driverKey: string,
): Promise<{ ok: boolean; message?: string }> {
  if (driverKey === DEMO_DRIVER_KEY) {
    return { ok: true };
  }

  const status = await fetchDriverStatus(driverKey);
  if (status.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    message: status.error ?? "Driver key was not accepted.",
  };
}

export type TrackingWindow = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  pickupAt: string;
  reason?: "too_early" | "too_late" | "open";
  opensAtDisplay?: string;
  closesAtDisplay?: string;
};

export type TrackLocation = {
  lat: number;
  lng: number;
  updatedAt: string;
};

export type PublicTrackResponse = {
  ok: true;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  pickupAt: string;
  pickupDisplay: string;
  trackingWindow: TrackingWindow;
  sharingActive: boolean;
  customerSharingActive: boolean;
  driver: TrackLocation | null;
  customer?: TrackLocation | null;
  trackUrl: string;
};

export type DriverFlight = {
  flightNumber: string;
  airline: string;
  date: string;
  scheduledTime: string;
  scheduledTimeLabel: string;
  airportCode: string;
  airportName: string;
  departureAirport: string;
  arrivalAirport: string;
  status?: string;
};

export type JobAssignmentStatus = "unassigned" | "pending" | "accepted" | "declined";

export type DriverJob = PublicTrackResponse & {
  token: string;
  customerMobile?: string;
  customerEmail?: string;
  paymentReference?: string;
  amountPaidLabel?: string;
  bookingStatus?: "confirmed" | "refunded";
  refundAmountLabel?: string;
  activeDriverName?: string;
  assignedDriverName?: string;
  assignmentStatus?: JobAssignmentStatus;
  assignedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  isAirportPickup?: boolean;
  flightNumber?: string | null;
  airportCode?: string | null;
  flight?: DriverFlight | null;
};

export type DriverJobsResponse = {
  ok: true;
  scope?: string;
  date: string;
  role?: "owner" | "driver";
  driverName?: string;
  jobs: DriverJob[];
};

export type DriverBookingUpdateInput = {
  token: string;
  tripDate?: string;
  tripTime?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  customerMobile?: string;
  flightNumber?: string;
};

export type DriverBookingUpdateResponse = {
  ok: true;
  job: DriverJob;
  warnings?: string[];
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error)
        : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export async function fetchPublicTrack(token: string): Promise<PublicTrackResponse> {
  if (isDemoTrackToken(token)) {
    return getDemoTrackResponse(token);
  }

  const response = await fetch(`${WORKER_BASE}/track/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return parseJsonResponse<PublicTrackResponse>(response);
}

export async function fetchDriverJobs(
  driverKey: string,
  options?: {
    date?: string;
    scope?: "date" | "upcoming";
    days?: number;
  },
): Promise<DriverJobsResponse> {
  if (driverKey === DEMO_DRIVER_KEY) {
    if (options?.scope === "upcoming") {
      return getDemoDriverUpcomingJobs();
    }
    return getDemoDriverJobs(options?.date);
  }

  const url = new URL(`${WORKER_BASE}/driver/jobs`);
  driverQueryKey(url, driverKey);
  if (options?.scope === "upcoming") {
    url.searchParams.set("scope", "upcoming");
    if (options.days) {
      url.searchParams.set("days", String(options.days));
    }
  } else if (options?.date) {
    url.searchParams.set("date", options.date);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return parseJsonResponse<DriverJobsResponse>(response);
}

export async function updateDriverBooking(
  driverKey: string,
  input: DriverBookingUpdateInput,
): Promise<DriverBookingUpdateResponse> {
  if (driverKey === DEMO_DRIVER_KEY) {
    const jobs = getDemoDriverUpcomingJobs().jobs;
    const job = jobs.find((entry) => entry.token === input.token);
    if (!job) {
      throw new Error("Job not found");
    }

    return {
      ok: true,
      job: {
        ...job,
        tripDate: input.tripDate ?? job.tripDate,
        tripTime: input.tripTime ?? job.tripTime,
        pickupLabel: input.pickupLabel ?? job.pickupLabel,
        dropoffLabel: input.dropoffLabel ?? job.dropoffLabel,
        customerMobile: input.customerMobile ?? job.customerMobile,
        flightNumber: input.flightNumber ?? job.flightNumber,
      },
    };
  }

  const response = await fetch(
    `${WORKER_BASE}/driver/bookings/update?key=${encodeURIComponent(driverKey.trim())}`,
    {
      method: "POST",
      headers: driverPostHeaders(driverKey),
      body: JSON.stringify(input),
    },
  );

  return parseJsonResponse<DriverBookingUpdateResponse>(response);
}

export async function setDriverSharing(
  driverKey: string,
  token: string,
  active: boolean,
): Promise<{ ok: true; trackUrl: string }> {
  if (driverKey === DEMO_DRIVER_KEY && isDemoTrackToken(token)) {
    const trackUrl = getDemoTrackResponse(token).trackUrl;
    return { ok: true, trackUrl };
  }

  const response = await fetch(`${WORKER_BASE}/driver/sharing?key=${encodeURIComponent(driverKey)}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Driver-Key": driverKey,
    },
    body: JSON.stringify({ token, active }),
  });

  return parseJsonResponse<{ ok: true; trackUrl: string }>(response);
}

export async function fetchDriverRoster(ownerKey: string): Promise<string[]> {
  const url = new URL(`${WORKER_BASE}/driver/roster`);
  driverQueryKey(url, ownerKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = await parseJsonResponse<{ ok: true; drivers: string[] }>(response);
  return payload.drivers;
}

export async function assignJobToDriver(
  ownerKey: string,
  token: string,
  driverName: string,
): Promise<{ ok: true; job: DriverJob }> {
  const response = await fetch(`${WORKER_BASE}/driver/assign?key=${encodeURIComponent(ownerKey.trim())}`, {
    method: "POST",
    headers: driverPostHeaders(ownerKey),
    body: JSON.stringify({ token, driverName }),
  });

  return parseJsonResponse<{ ok: true; job: DriverJob }>(response);
}

export async function deassignJob(
  ownerKey: string,
  token: string,
): Promise<{ ok: true; job: DriverJob }> {
  const response = await fetch(`${WORKER_BASE}/driver/deassign?key=${encodeURIComponent(ownerKey.trim())}`, {
    method: "POST",
    headers: driverPostHeaders(ownerKey),
    body: JSON.stringify({ token }),
  });

  return parseJsonResponse<{ ok: true; job: DriverJob }>(response);
}

export async function respondToJobAssignment(
  driverKey: string,
  token: string,
  action: "accept" | "decline",
): Promise<{ ok: true; job: DriverJob }> {
  const response = await fetch(
    `${WORKER_BASE}/driver/assignment?key=${encodeURIComponent(driverKey.trim())}`,
    {
      method: "POST",
      headers: driverPostHeaders(driverKey),
      body: JSON.stringify({ token, action }),
    },
  );

  return parseJsonResponse<{ ok: true; job: DriverJob }>(response);
}

export async function postDriverLocation(
  driverKey: string,
  token: string,
  lat: number,
  lng: number,
): Promise<void> {
  if (driverKey === DEMO_DRIVER_KEY) {
    return;
  }

  const response = await fetch(`${WORKER_BASE}/driver/location?key=${encodeURIComponent(driverKey)}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Driver-Key": driverKey,
    },
    body: JSON.stringify({ token, lat, lng }),
  });

  await parseJsonResponse<{ ok: true }>(response);
}

export async function setCustomerSharing(
  token: string,
  active: boolean,
): Promise<{ ok: true; customerSharingActive: boolean }> {
  if (isDemoTrackToken(token)) {
    return { ok: true, customerSharingActive: active };
  }

  const response = await fetch(`${WORKER_BASE}/track/sharing`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, active }),
  });

  return parseJsonResponse<{ ok: true; customerSharingActive: boolean }>(response);
}

export async function postCustomerLocation(
  token: string,
  lat: number,
  lng: number,
): Promise<void> {
  if (isDemoTrackToken(token)) {
    return;
  }

  const response = await fetch(`${WORKER_BASE}/track/location`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, lat, lng }),
  });

  await parseJsonResponse<{ ok: true }>(response);
}

export function buildWhatsAppTrackLink(trackUrl: string, customerName: string): string {
  const message = `Hi ${customerName}, you can follow your driver's live location here when they are on the way: ${trackUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
