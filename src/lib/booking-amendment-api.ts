import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { DateTimeAmendmentAuditEntry } from "../../shared/booking-amendment";
import { CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS } from "../../shared/booking-amendment";

const WORKER_BASE = resolveWorkerBaseUrl();

export { CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS };

export type ManageBookingSummary = {
  paymentReference: string;
  customerName: string;
  customerEmail?: string;
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
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
  } | null;
  lastUpdatedConfirmationSentAt?: string;
  lastUpdatedConfirmationError?: string;
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
};

export type AmendScheduleResult =
  | {
      kind: "updated";
      booking: ManageBookingSummary;
      emailUi?: { headline: string; body: string };
      fareLabel?: string;
      customerEmailSent?: boolean;
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
    };

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

export async function lookupBookingForAmendment(input: {
  paymentReference: string;
  customerEmail: string;
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

export async function amendBookingSchedule(input: {
  paymentReference: string;
  customerEmail: string;
  tripDate: string;
  tripTime: string;
}): Promise<AmendScheduleResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);

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
    };
  }

  if (!response.ok) {
    const err = new Error(String(payload.error || "Could not update this booking.")) as Error & {
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
  };
}

export async function startAmendmentTopUpPayment(input: {
  paymentReference: string;
  customerEmail: string;
  amendmentId?: string;
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
