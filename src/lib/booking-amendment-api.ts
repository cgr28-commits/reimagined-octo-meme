import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { DateTimeAmendmentAuditEntry } from "../../shared/booking-amendment";
import { CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS } from "../../shared/booking-amendment";

const WORKER_BASE = resolveWorkerBaseUrl();

export { CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS };

export type ManageBookingSummary = {
  paymentReference: string;
  customerReference?: string;
  customerName: string;
  customerEmail?: string;
  mobileNumber?: string;
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  passengers?: number;
  suitcases?: number;
  childSeats?: number;
  childSeatNotes?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  isAirportTrip?: boolean;
  airportCode?: string;
  isFromAirport?: boolean;
  returnJourney?: boolean;
  maxOnlinePassengers?: number;
  amountPaidLabel: string;
  journeyFare?: number;
  journeyFareLabel?: string;
  refundDueAmount?: number;
  amountRefunded?: number;
  dateTimeAmendmentCount: number;
  freeAmendmentAvailable: boolean;
  within24HoursOfPickup: boolean;
  hoursUntilPickup: number | null;
  originalTripDate?: string;
  originalTripTime?: string;
  dateTimeAmendmentHistory: DateTimeAmendmentAuditEntry[];
  within24hHeadline: string;
  within24hBody: string;
  freeAmendmentHint: string;
  pendingAmendment?: {
    amendmentId: string;
    previousFare: number;
    newFare: number;
    additionalPaymentAmount: number;
    expiresAt?: string;
    status?: string;
    paymentUrl?: string;
    proposed?: Record<string, string | number | boolean | null | undefined>;
  } | null;
  lastUpdatedConfirmationSentAt?: string;
  lastUpdatedConfirmationError?: string;
  manageBookingUrl?: string;
  hasManageToken?: boolean;
  selfServiceFields?: readonly string[];
};

export type AmendmentFareSummary = {
  previousFare: number;
  newFare: number;
  difference: number;
  previousFareLabel?: string;
  newFareLabel?: string;
  differenceLabel?: string;
  label?: string;
  kind?: string;
  amountPaidLabel?: string;
};

export type AmendmentReview = {
  changes: string[];
  diffs: Array<{ field: string; label: string; oldValue: string; newValue: string }>;
  fare: AmendmentFareSummary;
  burnsFreeQuota: boolean;
  proposed: {
    tripDate: string;
    tripTime: string;
    pickupLabel: string;
    dropoffLabel: string;
    passengers: number;
    suitcases: number;
    childSeats: number;
    childSeatNotes: string;
    flightNumber: string;
    mobileNumber: string;
  };
};

export type AmendPayload = {
  paymentReference: string;
  customerEmail: string;
  token?: string;
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  passengers: number;
  suitcases: number;
  childSeats: number;
  childSeatNotes?: string;
  flightNumber?: string;
  mobileNumber: string;
};

export type AmendScheduleResult =
  | {
      kind: "updated";
      booking: ManageBookingSummary;
      emailUi?: { headline: string; body: string };
      fareLabel?: string;
      customerEmailSent?: boolean;
      review?: AmendmentReview;
    }
  | {
      kind: "payment_required";
      booking: ManageBookingSummary;
      fare: AmendmentFareSummary;
      paymentUrl: string;
      checkoutId: string;
      amountDue: number;
      amountDueLabel: string;
      payCtaLabel: string;
      note: string;
      pendingAmendment: ManageBookingSummary["pendingAmendment"];
      review?: AmendmentReview;
    }
  | {
      kind: "preview";
      booking: ManageBookingSummary;
      review: AmendmentReview;
      contactRequired?: boolean;
      headline?: string;
      body?: string;
      reason?: string;
    };

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

export async function lookupBookingForAmendment(input: {
  paymentReference?: string;
  customerEmail?: string;
  token?: string;
}): Promise<ManageBookingSummary> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not find that booking."));
  }
  return payload.booking as ManageBookingSummary;
}

function mapAmendResponse(
  response: Response,
  payload: Record<string, unknown>,
): AmendScheduleResult {
  if (payload.preview === true && payload.review && typeof payload.review === "object") {
    return {
      kind: "preview",
      booking: payload.booking as ManageBookingSummary,
      review: payload.review as AmendmentReview,
      contactRequired: Boolean(payload.contactRequired),
      headline: payload.headline ? String(payload.headline) : undefined,
      body: payload.body ? String(payload.body) : undefined,
      reason: payload.reason ? String(payload.reason) : undefined,
    };
  }

  if (response.status === 402 || payload.reason === "additional_payment_required") {
    if (!payload.paymentUrl || !payload.booking) {
      const err = new Error(
        String(payload.paymentError || payload.error || "Additional payment is required."),
      ) as Error & { reason?: string; contactRequired?: boolean; booking?: ManageBookingSummary };
      err.reason = String(payload.reason || "additional_payment_required");
      err.contactRequired = Boolean(payload.contactRequired);
      if (payload.booking && typeof payload.booking === "object") {
        err.booking = payload.booking as ManageBookingSummary;
      }
      throw err;
    }
    const fare = (payload.fare || {}) as AmendmentFareSummary;
    return {
      kind: "payment_required",
      booking: payload.booking as ManageBookingSummary,
      fare,
      paymentUrl: String(payload.paymentUrl),
      checkoutId: String(payload.checkoutId || ""),
      amountDue: Number(payload.amountDue) || Number(fare.difference) || 0,
      amountDueLabel: String(payload.amountDueLabel || fare.differenceLabel || ""),
      payCtaLabel: String(payload.payCtaLabel || `Pay now`),
      note: String(
        payload.note ||
          "Your existing booking will remain unchanged until the additional payment is completed.",
      ),
      pendingAmendment:
        payload.pendingAmendment && typeof payload.pendingAmendment === "object"
          ? (payload.pendingAmendment as ManageBookingSummary["pendingAmendment"])
          : null,
      review:
        payload.review && typeof payload.review === "object"
          ? (payload.review as AmendmentReview)
          : undefined,
    };
  }

  if (!response.ok) {
    const err = new Error(
      String(
        payload.error ||
          "We couldn’t update your booking. Your existing booking has not been changed. Please try again or contact us.",
      ),
    ) as Error & {
      reason?: string;
      contactRequired?: boolean;
      headline?: string;
      body?: string;
      booking?: ManageBookingSummary;
    };
    err.reason = String(payload.reason || "");
    err.contactRequired = Boolean(payload.contactRequired);
    err.headline = payload.headline ? String(payload.headline) : undefined;
    err.body = payload.body
      ? String(payload.body)
      : payload.note
        ? String(payload.note)
        : undefined;
    if (payload.booking && typeof payload.booking === "object") {
      err.booking = payload.booking as ManageBookingSummary;
    }
    throw err;
  }

  const emailUi =
    payload.emailUi && typeof payload.emailUi === "object"
      ? (payload.emailUi as { headline: string; body: string })
      : undefined;
  const fare =
    payload.fare && typeof payload.fare === "object"
      ? (payload.fare as { label?: string })
      : undefined;
  return {
    kind: "updated",
    booking: payload.booking as ManageBookingSummary,
    emailUi,
    fareLabel: fare?.label,
    customerEmailSent: Boolean(payload.customerEmailSent),
    review:
      payload.review && typeof payload.review === "object"
        ? (payload.review as AmendmentReview)
        : undefined,
  };
}

export async function previewBookingAmendment(
  input: AmendPayload,
): Promise<AmendScheduleResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...input, preview: true }),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  return mapAmendResponse(response, payload);
}

export async function amendBookingSchedule(
  input: AmendPayload,
): Promise<AmendScheduleResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...input, preview: false }),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  return mapAmendResponse(response, payload);
}

export async function abandonPendingAmendment(input: {
  paymentReference?: string;
  customerEmail?: string;
  token?: string;
}): Promise<ManageBookingSummary> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok || !payload.booking) {
    throw new Error(String(payload.error || "Could not cancel the pending payment request."));
  }
  return payload.booking as ManageBookingSummary;
}

export async function startAmendmentTopUpPayment(input: {
  paymentReference: string;
  customerEmail: string;
  amendmentId?: string;
  token?: string;
}): Promise<{
  paymentUrl: string;
  amountDueLabel: string;
  payCtaLabel: string;
  fare: AmendmentFareSummary;
  note: string;
}> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok || !payload.paymentUrl) {
    throw new Error(String(payload.error || "Could not start the additional payment."));
  }
  return {
    paymentUrl: String(payload.paymentUrl),
    amountDueLabel: String(payload.amountDueLabel || ""),
    payCtaLabel: String(payload.payCtaLabel || "Pay now"),
    fare: (payload.fare || {}) as AmendmentFareSummary,
    note: String(payload.note || ""),
  };
}

/** After SumUp return — load amended booking using checkout id only (no email in URL). */
export async function loadBookingAfterAmendmentReturn(input: {
  checkoutId: string;
}): Promise<{
  booking: ManageBookingSummary;
  customerEmailSent: boolean;
  amendmentCommitted: boolean;
  paymentReference: string;
}> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-return`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok || !payload.booking) {
    throw new Error(String(payload.error || "Could not reload the amended booking."));
  }
  return {
    booking: payload.booking as ManageBookingSummary,
    customerEmailSent: Boolean(payload.customerEmailSent),
    amendmentCommitted: Boolean(payload.amendmentCommitted),
    paymentReference: String(payload.paymentReference || ""),
  };
}
