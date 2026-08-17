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
  unavailablePeriodIdApplied?: string | null;
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

export type UnavailablePeriodSummary = {
  id: string;
  startLocal: string;
  endLocal: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type BookingSettings = {
  unavailablePeriods: UnavailablePeriodSummary[];
  activeUnavailablePeriods?: UnavailablePeriodSummary[];
  activeCount?: number;
  updatedAt: string;
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
    throw new Error(String(payload.error || "Could not load short-notice bookings"));
  }
  return Array.isArray(payload.bookings)
    ? (payload.bookings as ShortNoticeBookingSummary[])
    : [];
}

export async function approveShortNoticeBooking(
  ownerKey: string,
  reference: string,
): Promise<{
  record: ShortNoticeBookingSummary;
  payUrl: string;
  whatsappPayUrl: string;
}> {
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
    record: payload.record as ShortNoticeBookingSummary,
    payUrl: String(payload.payUrl ?? ""),
    whatsappPayUrl: String(payload.whatsappPayUrl ?? ""),
  };
}

export async function declineShortNoticeBooking(
  ownerKey: string,
  reference: string,
): Promise<ShortNoticeBookingSummary> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/decline`, {
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
    throw new Error(String(payload.error || "Could not decline short-notice booking"));
  }
  return payload.record as ShortNoticeBookingSummary;
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
  return payload.settings as BookingSettings;
}

export type UnavailablePeriodWriteInput = {
  id?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  note?: string;
};

export async function addUnavailablePeriod(
  ownerKey: string,
  input: UnavailablePeriodWriteInput,
): Promise<BookingSettings> {
  const response = await fetch(`${WORKER_BASE}/owner/booking-settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      action: "add",
      startDate: input.startDate,
      startTime: input.startTime,
      endDate: input.endDate,
      endTime: input.endTime,
      note: input.note ?? "",
    }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not add unavailable period"));
  }
  return payload.settings as BookingSettings;
}

export async function updateUnavailablePeriod(
  ownerKey: string,
  input: UnavailablePeriodWriteInput & { id: string },
): Promise<BookingSettings> {
  const response = await fetch(`${WORKER_BASE}/owner/booking-settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      action: "update",
      id: input.id,
      startDate: input.startDate,
      startTime: input.startTime,
      endDate: input.endDate,
      endTime: input.endTime,
      note: input.note ?? "",
    }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not update unavailable period"));
  }
  return payload.settings as BookingSettings;
}

export async function deleteUnavailablePeriod(
  ownerKey: string,
  id: string,
): Promise<BookingSettings> {
  const response = await fetch(`${WORKER_BASE}/owner/booking-settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ action: "delete", id }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not delete unavailable period"));
  }
  return payload.settings as BookingSettings;
}

/** @deprecated Use addUnavailablePeriod / update / delete */
export async function saveBookingSettings(
  ownerKey: string,
  _legacy: string | null,
): Promise<BookingSettings> {
  void _legacy;
  return fetchBookingSettings(ownerKey);
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
