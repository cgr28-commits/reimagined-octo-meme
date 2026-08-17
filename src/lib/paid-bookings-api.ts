import type { PaidBookingRecord } from "../../shared/paid-booking-record";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

const WORKER_BASE = resolveWorkerBaseUrl();

export type OwnerReviewRequestSummary = {
  status: "not_scheduled" | "scheduled" | "sent" | "failed";
  scheduledAt?: string;
  dueAt?: string;
  sentAt?: string;
  failedAt?: string;
  lastError?: string;
};

export type OwnerPaidBookingSummary = Pick<
  PaidBookingRecord,
  | "paymentReference"
  | "checkoutId"
  | "createdAt"
  | "status"
  | "customerName"
  | "customerEmail"
  | "mobileNumber"
  | "tripLabel"
  | "pickupLabel"
  | "dropoffLabel"
  | "tripDate"
  | "tripTime"
  | "returnJourney"
  | "returnDate"
  | "returnTime"
> & {
  amountPaid: string;
  trackingToken?: string;
  sharingActive?: boolean;
  journeyStatus?: string;
  journeyCompletedAt?: string;
  driverUpdatedAt?: string;
  trackUrl?: string;
  reviewRequest?: OwnerReviewRequestSummary;
};

export type OwnerPendingCheckoutSummary = {
  checkoutId: string;
  checkoutReference: string;
  amount: number;
  createdAt: string;
  finalizedAt?: string;
  paymentReference?: string;
  customerName: string;
  customerEmail: string;
  tripLabel: string;
  tripDate: string;
  sumUpStatus?: string;
  sumUpPaid?: boolean;
  paidBookingExists: boolean;
  needsFinalize: boolean;
};

export type FinalizeCheckoutResult = {
  ok: boolean;
  checkoutId?: string;
  action?: string;
  sumUpStatus?: string;
  bookingStatus?: string;
  paid?: boolean;
  customerEmailSent?: boolean;
  ownerEmailSent?: boolean;
  calendarLogged?: boolean;
  calendarEvents?: number;
  paymentReference?: string;
  amountPaid?: string;
  alreadyFinalized?: boolean;
  error?: string;
  message?: string;
  primary?: FinalizeCheckoutResult;
  recovered?: FinalizeCheckoutResult[];
  scanned?: number;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
}

export async function fetchOwnerPaidBookings(
  ownerKey: string,
  options?: { days?: number; limit?: number },
): Promise<OwnerPaidBookingSummary[]> {
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 50;
  const response = await fetch(
    `${WORKER_BASE}/paid-bookings?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`,
    {
      headers: {
        Accept: "application/json",
        "X-Owner-Key": ownerKey.trim(),
      },
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to load paid bookings"));
  }
  return Array.isArray(payload.bookings)
    ? (payload.bookings as OwnerPaidBookingSummary[])
    : [];
}

export async function fetchOwnerPendingCheckouts(
  ownerKey: string,
  options?: { limit?: number },
): Promise<OwnerPendingCheckoutSummary[]> {
  const limit = options?.limit ?? 40;
  const response = await fetch(
    `${WORKER_BASE}/paid-bookings/pending?limit=${encodeURIComponent(String(limit))}`,
    {
      headers: {
        Accept: "application/json",
        "X-Owner-Key": ownerKey.trim(),
      },
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to load pending checkouts"));
  }
  return Array.isArray(payload.pending)
    ? (payload.pending as OwnerPendingCheckoutSummary[])
    : [];
}

export async function finalizePaidCheckoutRecovery(
  ownerKey: string,
  options?: { checkoutId?: string; preferTestOnePound?: boolean },
): Promise<FinalizeCheckoutResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/finalize-checkout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      ...(options?.checkoutId ? { checkoutId: options.checkoutId } : { scan: true }),
      preferTestOnePound: options?.preferTestOnePound ?? true,
    }),
  });
  const payload = await parseJson(response);
  if (!response.ok && response.status !== 402) {
    throw new Error(String(payload.error ?? payload.message ?? "Failed to finalize checkout"));
  }
  return payload as unknown as FinalizeCheckoutResult;
}

export type ResendPaidConfirmationResult = {
  ok: boolean;
  paymentReference: string;
  customerEmail: string;
  customerEmailSent: boolean;
  ownerEmailSent?: boolean;
  customerEmailError?: string;
  tripLabel?: string;
  amountPaid?: string;
};

export async function resendPaidBookingConfirmation(
  ownerKey: string,
  paymentReference: string,
): Promise<ResendPaidConfirmationResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/resend-confirmation`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ paymentReference }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to resend confirmation"));
  }
  return {
    ok: payload.ok === true,
    paymentReference: String(payload.paymentReference ?? paymentReference),
    customerEmail: String(payload.customerEmail ?? ""),
    customerEmailSent: payload.customerEmailSent === true,
    ownerEmailSent: payload.ownerEmailSent === true,
    customerEmailError:
      typeof payload.customerEmailError === "string" ? payload.customerEmailError : undefined,
    tripLabel: typeof payload.tripLabel === "string" ? payload.tripLabel : undefined,
    amountPaid: typeof payload.amountPaid === "string" ? payload.amountPaid : undefined,
  };
}

export type SendReviewRequestResult = {
  ok: boolean;
  alreadySent?: boolean;
  resent?: boolean;
  customerEmail?: string;
  error?: string;
  reviewRequest?: OwnerReviewRequestSummary;
};

export async function sendOwnerReviewRequest(
  ownerKey: string,
  options: { paymentReference?: string; token?: string; forceResend?: boolean },
): Promise<SendReviewRequestResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/review-request`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      ...(options.paymentReference ? { paymentReference: options.paymentReference } : {}),
      ...(options.token ? { token: options.token } : {}),
      ...(options.forceResend ? { forceResend: true } : {}),
    }),
  });
  const payload = await parseJson(response);
  const reviewRequest =
    payload.reviewRequest && typeof payload.reviewRequest === "object"
      ? (payload.reviewRequest as OwnerReviewRequestSummary)
      : undefined;

  if (!response.ok) {
    return {
      ok: false,
      alreadySent: payload.alreadySent === true,
      error: String(payload.error ?? "Failed to send review request"),
      reviewRequest,
    };
  }

  return {
    ok: payload.ok === true,
    resent: payload.resent === true,
    customerEmail: typeof payload.customerEmail === "string" ? payload.customerEmail : undefined,
    reviewRequest,
  };
}

/** Owner-only read-only tracking diagnostic (Worker validates OWNER_ACCESS_KEY server-side). */
export type TrackingDiagnosticReport = {
  ok: boolean;
  readOnly: boolean;
  paymentReference: string | null;
  paidBookingFound?: boolean;
  sessionFound: boolean;
  sessionCount?: number;
  sessionId?: string;
  paymentReferenceLinked?: boolean;
  gpsPointCount?: number;
  firstPointAt?: string | null;
  lastPointAt?: string | null;
  fieldsStored?: {
    latitudeLongitude: boolean;
    accuracyMeters: boolean;
    speedMps: boolean;
    headingDegrees: boolean;
  };
  trackingStartedAt?: string | null;
  trackingStoppedAt?: string | null;
  journeyEvents?: {
    journeyStatus: string;
    trackingStartedAt: string | null;
    arrivedPickupAt: string | null;
    journeyStartedAt: string | null;
    arrivedDestinationAt: string | null;
    journeyCompletedAt: string | null;
    trackingStoppedAt: string | null;
    sharingActive: boolean;
  };
  storage?: {
    location: string;
    binding: string;
    jobKeyPrefix?: string;
    historyKeyPrefix?: string;
    paymentRefIndexPrefix?: string;
    durableObject: boolean;
    d1: boolean;
  };
  retention?: {
    trackingJobTtlDays: number;
    gpsHistoryTtlDays: number;
    gpsSessionTtlHours: number;
    note: string;
  };
  routeReconstructable?: boolean;
  customerSeesHistoricalRoute: boolean;
  customerPrivacy?: {
    livePinOnly: boolean;
    historicalTrailExposed: boolean;
    historicalEvidenceOwnerOnly: boolean;
  };
  sessions?: TrackingDiagnosticReport[];
  error?: string;
};

export async function fetchTrackingDiagnostic(
  ownerKey: string,
  paymentReference: string,
): Promise<TrackingDiagnosticReport> {
  const ref = paymentReference.trim();
  const response = await fetch(
    `${WORKER_BASE}/paid-bookings/tracking-diagnostic?paymentReference=${encodeURIComponent(ref)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Owner-Key": ownerKey.trim(),
      },
      cache: "no-store",
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to load tracking diagnostic"));
  }
  return payload as unknown as TrackingDiagnosticReport;
}
