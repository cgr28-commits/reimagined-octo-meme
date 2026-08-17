import { resolveWorkerBaseUrl } from "@/lib/worker-api";

const WORKER_BASE = resolveWorkerBaseUrl();

export type ShortNoticeBookingSummary = {
  reference: string;
  paymentToken: string;
  status: string;
  amount: number;
  amountLabel: string;
  materialFingerprint: string;
  minimumNoticeHoursApplied?: number;
  automaticBookingsAvailableFromApplied?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedAmount?: number;
  paymentExpiresAt?: string;
  declinedAt?: string;
  booking: {
    customerName: string;
    customerEmail: string;
    mobileNumber: string;
    pickupLabel: string;
    dropoffLabel: string;
    tripDate: string;
    tripTime: string;
    returnJourney: boolean;
    returnDate?: string;
    returnTime?: string;
    passengers: number;
    suitcases: number;
    vehicle: string;
    flightNumber?: string;
    returnFlightNumber?: string;
    tripLabel?: string;
    journeyDistance?: string;
    journeyDuration?: string;
    isAirportTrip?: boolean;
    airportCode?: string;
  };
};

export type BookingSettings = {
  automaticBookingsAvailableFrom: string | null;
  updatedAt: string;
  gateActive?: boolean;
  availableFromLabel?: string | null;
};

export type PublicShortNoticeSummary = {
  reference: string;
  status: string;
  amount: number;
  amountLabel: string;
  service: string;
  vehicle: string;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  flightNumber?: string;
  paymentExpiresAt: string | null;
  payable: boolean;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function fetchShortNoticeBookings(
  ownerKey: string,
): Promise<ShortNoticeBookingSummary[]> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice`, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not load short-notice requests"));
  }
  const bookings = Array.isArray(payload.bookings) ? payload.bookings : [];
  return bookings as ShortNoticeBookingSummary[];
}

export async function approveShortNoticeBooking(
  ownerKey: string,
  reference: string,
): Promise<{ payUrl: string; whatsappPayUrl: string; record: ShortNoticeBookingSummary }> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ reference }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not approve short-notice booking"));
  }
  return {
    payUrl: String(payload.payUrl || ""),
    whatsappPayUrl: String(payload.whatsappPayUrl || ""),
    record: payload.record as ShortNoticeBookingSummary,
  };
}

export async function declineShortNoticeBooking(
  ownerKey: string,
  reference: string,
  reason?: string,
): Promise<void> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/decline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ reference, reason }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not decline short-notice booking"));
  }
}

export async function fetchBookingSettings(ownerKey: string): Promise<BookingSettings> {
  const response = await fetch(`${WORKER_BASE}/owner/booking-settings`, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not load booking settings"));
  }
  const settings = payload.settings as BookingSettings;
  return settings;
}

export async function saveBookingSettings(
  ownerKey: string,
  automaticBookingsAvailableFrom: string | null,
): Promise<BookingSettings> {
  const response = await fetch(`${WORKER_BASE}/owner/booking-settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      automaticBookingsAvailableFrom,
      ...(automaticBookingsAvailableFrom == null ? { clear: true } : {}),
    }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not save booking settings"));
  }
  return payload.settings as BookingSettings;
}

export async function fetchPublicShortNotice(
  token: string,
): Promise<PublicShortNoticeSummary> {
  const response = await fetch(
    `${WORKER_BASE}/short-notice?token=${encodeURIComponent(token.trim())}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Payment link not found"));
  }
  return payload.booking as PublicShortNoticeSummary;
}
