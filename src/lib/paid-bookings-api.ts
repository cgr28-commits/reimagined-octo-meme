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
  | "operationalStatus"
  | "paymentStatus"
  | "transactionId"
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
  | "amountRefunded"
  | "refundDueAmount"
  | "refundDueReason"
  | "lastUpdatedConfirmationSentAt"
  | "lastUpdatedConfirmationError"
  | "refundHistory"
  | "cancelledAt"
  | "refundedAt"
  | "termsAcceptedAt"
  | "termsVersion"
  | "cancellationPolicyVersion"
> & {
  amountPaid: string;
  /** Current journey fare when provided by the worker. */
  amount?: number;
  originalAmount?: number;
  trackingToken?: string;
  sharingActive?: boolean;
  journeyStatus?: string;
  journeyCompletedAt?: string;
  driverUpdatedAt?: string;
  trackUrl?: string;
  reviewRequest?: OwnerReviewRequestSummary;
  flightNumber?: string;
  returnFlightNumber?: string;
  airportCode?: string;
  isFromAirport?: boolean;
  /** Explicit Express vs free airport access — present on bookings after option was offered. */
  expressDropOffSelected?: boolean;
  expressDropOffFee?: number;
  expressDropOffAirport?: "BFS" | "BHD" | null;
  airportAccessOption?: "express" | "free" | null;
  passengers?: number;
  suitcases?: number;
  childSeats?: number;
  childSeatNotes?: string;
  notes?: string;
  vehicle?: string;
  assignedDriverName?: string;
  assignedDriverLabel?: string;
  assignmentStatus?: string;
  primaryDriverDefault?: boolean;
  arrivedPickupAt?: string;
  arrivalNotificationStatus?: "sent" | "failed" | "not_configured" | "skipped" | string;
  arrivalNotificationSentAt?: string;
  arrivalNotificationProvider?: "email" | "sms" | "whatsapp" | string;
  arrivalNotificationError?: string;
  outboundJourneyStatus?: string;
  returnJourneyStatus?: string;
  allLegsCompleted?: boolean;
  nextUnfinishedLegDate?: string;
  nextUnfinishedLegTime?: string;
  editHistory?: PaidBookingRecord["editHistory"];
  /** Owner-only £1 refund smoke-test — never show in operational lists. */
  isRefundTest?: boolean;
  /** Same-fare amendment fixture — never show in operational lists. */
  isAmendmentTestFixture?: boolean;
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
  options?: {
    days?: number;
    limit?: number;
    mode?: "upcoming" | "recent";
    pastDays?: number;
    futureDays?: number;
  },
): Promise<OwnerPaidBookingSummary[]> {
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 100;
  const mode = options?.mode ?? "upcoming";
  const pastDays = options?.pastDays ?? 2;
  const futureDays = options?.futureDays ?? 90;
  const params = new URLSearchParams({
    mode,
    days: String(days),
    limit: String(limit),
    pastDays: String(pastDays),
    futureDays: String(futureDays),
  });
  const response = await fetch(`${WORKER_BASE}/paid-bookings?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
  });
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
  /** Only "resend" counts as a trustworthy review delivery. */
  provider?: string;
  resendId?: string;
  emailSource?: "tracking" | "paid_booking";
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
  const provider = typeof payload.provider === "string" ? payload.provider : undefined;
  const resendId = typeof payload.resendId === "string" ? payload.resendId : undefined;
  const emailSource =
    payload.emailSource === "tracking" || payload.emailSource === "paid_booking"
      ? payload.emailSource
      : undefined;

  if (!response.ok) {
    return {
      ok: false,
      alreadySent: payload.alreadySent === true,
      error: String(payload.error ?? "Failed to send review request"),
      provider,
      resendId,
      emailSource,
      reviewRequest,
    };
  }

  const ok = payload.ok === true && provider === "resend";
  return {
    ok,
    resent: payload.resent === true,
    customerEmail: typeof payload.customerEmail === "string" ? payload.customerEmail : undefined,
    provider,
    resendId,
    emailSource,
    ...(ok
      ? {}
      : {
          error:
            typeof payload.error === "string"
              ? payload.error
              : "Review request was not accepted by Resend",
        }),
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

export type RefundDiagnosticsReport = {
  ok: boolean;
  coordinatorConfigured: boolean;
  sumUpConfigured: boolean;
  paymentReference: string;
  transactionId?: string | null;
  transactionCode?: string | null;
  checkoutId?: string | null;
  currency?: string;
  originalAmount: number;
  amountRefunded: number;
  remainingRefundable: number;
  /** True when this diagnostics call raised local amountRefunded from SumUp. */
  syncedFromProcessor?: boolean;
  amountPaidLabel?: string;
  combinedStatus?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  cancelledAt?: string | null;
  refundedAt?: string | null;
  calendarEventCount?: number;
  trackingTokenPresent?: boolean;
  latestRefundOperation?: {
    auditId: string;
    operationState: string;
    actionKind?: string;
    refundAmount: number;
    cumulativeRefundedAmount: number;
    remainingBalance: number;
    amountRetained?: number | null;
    cancelBooking: boolean;
    reasonCategory?: string;
    reasonLabel?: string | null;
    ownerNotes?: string | null;
    ownerNotesAt?: string | null;
    initiatedBy?: string | null;
    within24HoursOfPickup?: boolean | null;
    bookingStatusAfter?: string | null;
    success: boolean;
    sumUpStatus?: string | null;
    sumUpTransactionId?: string | null;
    customerEmailStatus: string;
    ownerEmailStatus: string;
    requestedAt: string;
    processorAcceptedAt?: string | null;
    completedAt?: string | null;
    failureDetail?: string | null;
    idempotencyKeySuffix?: string | null;
  } | null;
  refundHistoryCount?: number;
  recentAudits?: Array<{
    auditId: string;
    operationState: string;
    refundAmount: number;
    cancelBooking: boolean;
    customerEmailStatus: string;
    ownerEmailStatus: string;
    requestedAt: string;
    completedAt?: string | null;
    success: boolean;
  }>;
  error?: string;
};

/** Owner-only read-only refund diagnostics (no secrets). */
export async function fetchRefundDiagnostics(
  ownerKey: string,
  paymentReference: string,
): Promise<RefundDiagnosticsReport> {
  const ref = paymentReference.trim();
  const response = await fetch(
    `${WORKER_BASE}/paid-bookings/refund-diagnostics?paymentReference=${encodeURIComponent(ref)}`,
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
    throw new Error(String(payload.error ?? "Failed to load refund diagnostics"));
  }
  return payload as unknown as RefundDiagnosticsReport;
}

export type OwnerEditBookingInput = {
  paymentReference: string;
  tripDate?: string;
  tripTime?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  customerName?: string;
  customerEmail?: string;
  mobileNumber?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  passengers?: number;
  suitcases?: number;
  childSeats?: number;
  childSeatNotes?: string;
  notes?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  tripLabel?: string;
  vehicle?: string;
  /** When true with material changes, keep current agreed fare and record server calculated as override. */
  keepAgreedFare?: boolean;
  agreedFare?: number;
  sendUpdatedConfirmation?: boolean;
};

export type OwnerEditBookingResult = {
  ok: boolean;
  paymentReference: string;
  booking?: OwnerPaidBookingSummary & {
    editHistory?: PaidBookingRecord["editHistory"];
    calendarEventIds?: string[];
  };
  fareMayNeedManualAdjustment?: boolean;
  fareAdjustmentMessage?: string;
  serverCalculatedFare?: number | null;
  currentAgreedFare?: number;
  keepAgreedFare?: boolean;
  paymentPreserved?: boolean;
  calendarUpdated?: boolean;
  customerEmailSent?: boolean;
  customerEmailError?: string;
  warnings?: string[];
  error?: string;
};

export async function editOwnerPaidBooking(
  ownerKey: string,
  input: OwnerEditBookingInput,
): Promise<OwnerEditBookingResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/edit`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify(input),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      paymentReference: input.paymentReference,
      error: String(payload.error ?? "Failed to edit booking"),
    };
  }
  return {
    ok: payload.ok === true,
    paymentReference: String(payload.paymentReference ?? input.paymentReference),
    booking: payload.booking as OwnerEditBookingResult["booking"],
    fareMayNeedManualAdjustment: payload.fareMayNeedManualAdjustment === true,
    fareAdjustmentMessage:
      typeof payload.fareAdjustmentMessage === "string"
        ? payload.fareAdjustmentMessage
        : undefined,
    serverCalculatedFare:
      typeof payload.serverCalculatedFare === "number" ? payload.serverCalculatedFare : null,
    currentAgreedFare:
      typeof payload.currentAgreedFare === "number" ? payload.currentAgreedFare : undefined,
    keepAgreedFare: payload.keepAgreedFare === true,
    paymentPreserved: payload.paymentPreserved === true,
    calendarUpdated: payload.calendarUpdated === true,
    customerEmailSent: payload.customerEmailSent === true,
    customerEmailError:
      typeof payload.customerEmailError === "string" ? payload.customerEmailError : undefined,
    warnings: Array.isArray(payload.warnings)
      ? payload.warnings.map((w) => String(w))
      : undefined,
  };
}

export async function sendUpdatedBookingConfirmation(
  ownerKey: string,
  paymentReference: string,
): Promise<{ ok: boolean; customerEmail?: string; error?: string }> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/send-updated-confirmation`, {
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
    return {
      ok: false,
      error: String(payload.error ?? "Failed to send updated confirmation"),
    };
  }
  return {
    ok: payload.ok === true && payload.customerEmailSent === true,
    customerEmail: typeof payload.customerEmail === "string" ? payload.customerEmail : undefined,
    ...(payload.customerEmailSent === true
      ? {}
      : { error: String(payload.error ?? "Updated confirmation was not sent") }),
  };
}

export type OwnerFinancialSummaryResponse = {
  ok: boolean;
  asOfDay: string;
  week: import("../../shared/owner-financial-summary").OwnerFinancialBucket;
  month: import("../../shared/owner-financial-summary").OwnerFinancialBucket;
  year: import("../../shared/owner-financial-summary").OwnerFinancialBucket;
  refunds: import("../../shared/owner-financial-summary").OwnerFinancialBucket;
  scanned?: number;
  error?: string;
};

/** Owner financial totals from payment/refund records (not visible job cards). */
export async function fetchOwnerFinancialSummary(
  ownerKey: string,
): Promise<OwnerFinancialSummaryResponse> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/financial-summary`, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to load financial summary"));
  }
  return payload as unknown as OwnerFinancialSummaryResponse;
}
