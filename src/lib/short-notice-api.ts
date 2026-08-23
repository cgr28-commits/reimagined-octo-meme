import { resolveWorkerBaseUrl } from "@/lib/worker-api";

const WORKER_BASE = resolveWorkerBaseUrl();

function currentSiteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}

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
  paymentLinkEmailSentAt?: string;
  paymentLinkEmailPayUrl?: string;
  originalRequestedDate?: string;
  originalRequestedTime?: string;
  offeredDate?: string;
  offeredTime?: string;
  offeredAt?: string;
  offeredNote?: string;
  acceptToken?: string;
  alternativeTimeEmailSentAt?: string;
  alternativeTimeEmailAcceptUrl?: string;
  acceptedAlternativeAt?: string;
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
  paymentEmailSent: boolean;
  paymentEmailError?: string;
}> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ reference, siteOrigin: currentSiteOrigin() }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not approve short-notice booking"));
  }
  return {
    record: payload.record as ShortNoticeBookingSummary,
    payUrl: String(payload.payUrl ?? ""),
    whatsappPayUrl: String(payload.whatsappPayUrl ?? ""),
    paymentEmailSent: payload.paymentEmailSent === true,
    ...(typeof payload.paymentEmailError === "string"
      ? { paymentEmailError: payload.paymentEmailError }
      : {}),
  };
}

export async function resendShortNoticePaymentEmail(
  ownerKey: string,
  reference: string,
): Promise<{
  record: ShortNoticeBookingSummary;
  payUrl: string;
  paymentEmailSent: true;
}> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/resend-payment-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ reference, siteOrigin: currentSiteOrigin() }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not resend payment email"));
  }
  return {
    record: payload.record as ShortNoticeBookingSummary,
    payUrl: String(payload.payUrl ?? ""),
    paymentEmailSent: true,
  };
}

export async function offerAlternativeShortNoticeTime(
  ownerKey: string,
  reference: string,
  input: { offeredDate: string; offeredTime: string; ownerNote?: string },
): Promise<{
  record: ShortNoticeBookingSummary;
  acceptUrl: string;
  alternativeEmailSent: boolean;
  alternativeEmailError?: string;
}> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/offer-alternative`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      reference,
      offeredDate: input.offeredDate,
      offeredTime: input.offeredTime,
      ownerNote: input.ownerNote ?? "",
      siteOrigin: currentSiteOrigin(),
    }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not offer alternative time"));
  }
  return {
    record: payload.record as ShortNoticeBookingSummary,
    acceptUrl: String(payload.acceptUrl ?? ""),
    alternativeEmailSent: payload.alternativeEmailSent === true,
    ...(typeof payload.alternativeEmailError === "string"
      ? { alternativeEmailError: payload.alternativeEmailError }
      : {}),
  };
}

export async function resendAlternativeShortNoticeEmail(
  ownerKey: string,
  reference: string,
): Promise<{
  record: ShortNoticeBookingSummary;
  acceptUrl: string;
  alternativeEmailSent: true;
}> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/resend-alternative-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ reference, siteOrigin: currentSiteOrigin() }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not resend alternative-time email"));
  }
  return {
    record: payload.record as ShortNoticeBookingSummary,
    acceptUrl: String(payload.acceptUrl ?? ""),
    alternativeEmailSent: true,
  };
}

export async function withdrawAlternativeShortNoticeOffer(
  ownerKey: string,
  reference: string,
): Promise<ShortNoticeBookingSummary> {
  const response = await fetch(`${WORKER_BASE}/owner/short-notice/withdraw-alternative`, {
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
    throw new Error(String(payload.error || "Could not withdraw alternative offer"));
  }
  return payload.record as ShortNoticeBookingSummary;
}

export type PublicAlternativeOfferSummary = {
  reference: string;
  status: string;
  amount: number;
  amountLabel: string;
  service: string;
  vehicle: string;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  requestedDate: string;
  requestedTime: string;
  offeredDate: string | null;
  offeredTime: string | null;
  offeredNote: string | null;
  passengers: number;
  suitcases: number;
  flightNumber?: string;
  acceptPending: boolean;
  alreadyAccepted: boolean;
};

export async function fetchPublicAlternativeOffer(
  token: string,
): Promise<PublicAlternativeOfferSummary> {
  const response = await fetch(
    `${WORKER_BASE}/short-notice/alternative-offer?token=${encodeURIComponent(token.trim())}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Acceptance link not found"));
  }
  return payload.offer as PublicAlternativeOfferSummary;
}

export async function acceptAlternativeShortNoticeTime(token: string): Promise<{
  record: ShortNoticeBookingSummary;
  payUrl: string;
  paymentEmailSent: boolean;
  alreadyAccepted?: boolean;
}> {
  const response = await fetch(`${WORKER_BASE}/short-notice/accept-alternative`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token, siteOrigin: currentSiteOrigin() }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not accept alternative time"));
  }
  return {
    record: payload.record as ShortNoticeBookingSummary,
    payUrl: String(payload.payUrl ?? ""),
    paymentEmailSent: payload.paymentEmailSent === true,
    ...(payload.alreadyAccepted === true ? { alreadyAccepted: true } : {}),
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
