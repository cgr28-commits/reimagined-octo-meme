import {
  DEMO_DRIVER_KEY,
  getDemoDriverJobs,
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

export type TrackingWindow = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  pickupAt: string;
  reason?: "too_early" | "too_late" | "open";
  opensAtDisplay?: string;
  closesAtDisplay?: string;
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
  driver: {
    lat: number;
    lng: number;
    updatedAt: string;
  } | null;
  trackUrl: string;
};

export type DriverJob = PublicTrackResponse & {
  token: string;
  customerMobile: string;
  paymentReference?: string;
};

export type DriverJobsResponse = {
  ok: true;
  date: string;
  jobs: DriverJob[];
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
  date?: string,
): Promise<DriverJobsResponse> {
  if (driverKey === DEMO_DRIVER_KEY) {
    return getDemoDriverJobs();
  }

  const url = new URL(`${WORKER_BASE}/driver/jobs`);
  url.searchParams.set("key", driverKey);
  if (date) {
    url.searchParams.set("date", date);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return parseJsonResponse<DriverJobsResponse>(response);
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

export function buildWhatsAppTrackLink(trackUrl: string, customerName: string): string {
  const message = `Hi ${customerName}, you can follow your driver's live location here when they are on the way: ${trackUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
