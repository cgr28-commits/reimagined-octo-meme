/**
 * SumUp top-up payments for higher-fare customer schedule amendments.
 * Creates a difference-only checkout and commits the amendment only after PAID.
 */

import {
  buildHigherFarePendingAmendment,
  validatePendingAmendmentForPayment,
  type DateTimeAmendmentAuditEntry,
} from "../shared/booking-amendment";
import { formatPaidAmount, type PaidBookingDetails } from "../shared/booking-notifications";
import { paidBookingRecordToDetails } from "../shared/paid-booking-canonical";
import type {
  PaidBookingAdditionalPayment,
  PaidBookingAmendmentEvent,
  PaidBookingRecord,
  PendingBookingAmendment,
} from "../shared/paid-booking-record";
import { grossAmountCollectedOf } from "../shared/paid-booking-record";
import {
  buildCheckoutReference,
  createSumUpHostedCheckout,
  getSuccessfulTransactionCode,
  getSuccessfulTransactionId,
  type SumUpCheckoutDetails,
} from "../shared/sumup-checkout";
import { buildPickupDateTimeLocal } from "../shared/tracking";
import {
  getGoogleAccessToken,
  parseServiceAccountJson,
  rescheduleCalendarEvents,
  transferEventEndDateTime,
} from "./google-calendar";
import {
  getPaidBookingRecord,
  updatePaidBookingFields,
} from "./paid-booking-store";
import {
  getPendingCheckout,
  markPendingCheckoutFinalized,
  savePendingCheckout,
} from "./pending-checkout-store";
import { sendUpdatedConfirmationForPaymentReference } from "./send-updated-confirmation";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  reindexTrackingJobDate,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import type { WorkerEmailEnv } from "./worker-email";

export {
  buildHigherFarePendingAmendment,
  validatePendingAmendmentForPayment,
} from "../shared/booking-amendment";

export type AmendmentTopUpEnv = WorkerEmailEnv & {
  TRACKING_STORE: KVNamespace;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
};

export async function createOrReuseAmendmentTopUpCheckout(input: {
  env: AmendmentTopUpEnv;
  booking: PaidBookingRecord;
  pending: PendingBookingAmendment;
  /** Absolute browser return URL after SumUp (manage-booking). */
  redirectUrl: string;
  /** Worker webhook URL. */
  returnUrl: string;
}): Promise<
  | {
      ok: true;
      pending: PendingBookingAmendment;
      paymentUrl: string;
      checkoutId: string;
      checkoutReference: string;
      amount: number;
      reused: boolean;
    }
  | { ok: false; reason: string; message: string }
> {
  const apiKey = input.env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = input.env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) {
    return {
      ok: false,
      reason: "sumup_not_configured",
      message: "Card payment is not available right now. Please contact My Airport Taxi NI.",
    };
  }

  const validation = validatePendingAmendmentForPayment({
    booking: input.booking,
    amendmentId: input.pending.amendmentId,
  });
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, message: validation.message };
  }

  // Reuse unpaid SumUp session when still valid.
  if (input.pending.checkoutId && input.pending.paymentUrl) {
    const existing = await getPendingCheckout(input.env.TRACKING_STORE, input.pending.checkoutId);
    if (
      existing &&
      existing.checkoutKind === "amendment-topup" &&
      !existing.finalizedAt &&
      existing.amendmentId === input.pending.amendmentId &&
      Math.abs(Number(existing.amount) - Number(input.pending.additionalPaymentAmount)) < 0.005
    ) {
      return {
        ok: true,
        pending: input.pending,
        paymentUrl: input.pending.paymentUrl,
        checkoutId: input.pending.checkoutId,
        checkoutReference: input.pending.checkoutReference || existing.checkoutReference,
        amount: input.pending.additionalPaymentAmount,
        reused: true,
      };
    }
  }

  const amount = Math.round(input.pending.additionalPaymentAmount * 100) / 100;
  const checkoutReference = buildCheckoutReference(
    `amend-${input.pending.amendmentId.slice(0, 8)}`,
  );
  const description = `Amendment top-up ${input.booking.paymentReference} (+£${amount.toFixed(2)})`;

  const checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
    amount,
    description,
    checkoutReference,
    redirectUrl: input.redirectUrl,
    returnUrl: input.returnUrl,
  });

  const bookingDetails: PaidBookingDetails = paidBookingRecordToDetails(input.booking);
  await savePendingCheckout(input.env.TRACKING_STORE, {
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    amount,
    booking: bookingDetails,
    createdAt: new Date().toISOString(),
    checkoutKind: "amendment-topup",
    amendmentBookingPaymentReference: input.booking.paymentReference,
    amendmentId: input.pending.amendmentId,
    amendmentIdempotencyKey: input.pending.idempotencyKey,
    amendmentPreviousFare: input.pending.previousFare,
    amendmentNewFare: input.pending.newFare,
  });

  const pending: PendingBookingAmendment = {
    ...input.pending,
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    paymentUrl: checkout.paymentUrl,
    idempotencyKey: `amend-pay:${input.booking.paymentReference}:${input.pending.amendmentId}`,
  };

  await updatePaidBookingFields(
    input.env.TRACKING_STORE,
    input.booking.paymentReference,
    { pendingAmendment: pending },
    { appendAudit: false },
  );

  return {
    ok: true,
    pending,
    paymentUrl: checkout.paymentUrl,
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    amount,
    reused: false,
  };
}

export type FinalizeAmendmentTopUpResult = {
  ok: boolean;
  paid: boolean;
  alreadyFinalized?: boolean;
  amendmentCommitted?: boolean;
  amountPaid: string;
  paymentReference: string;
  bookingPaymentReference: string;
  customerEmailSent: boolean;
  emailWarning?: string;
  error?: string;
  abandonedWithoutCommit?: boolean;
  /** Public booking snapshot for Manage Booking return (no secrets). */
  booking?: {
    paymentReference: string;
    customerName: string;
    customerEmail: string;
    tripDate: string;
    tripTime: string;
    pickupLabel: string;
    dropoffLabel: string;
    amountPaidLabel: string;
    journeyFare: number;
  };
};

function amendmentBookingSnapshot(record: PaidBookingRecord) {
  return {
    paymentReference: record.paymentReference,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    amountPaidLabel: record.amountPaidLabel,
    journeyFare: record.amount,
  };
}
export async function finalizeAmendmentTopUpCheckout(input: {
  env: AmendmentTopUpEnv;
  checkoutId: string;
  checkout: SumUpCheckoutDetails;
}): Promise<FinalizeAmendmentTopUpResult> {
  const pendingCheckout = await getPendingCheckout(input.env.TRACKING_STORE, input.checkoutId);
  if (!pendingCheckout || pendingCheckout.checkoutKind !== "amendment-topup") {
    return {
      ok: false,
      paid: true,
      amountPaid: "",
      paymentReference: "",
      bookingPaymentReference: "",
      customerEmailSent: false,
      error: "Not an amendment top-up checkout",
    };
  }

  const bookingRef = String(pendingCheckout.amendmentBookingPaymentReference || "").trim();
  const amendmentId = String(pendingCheckout.amendmentId || "").trim();
  const topUpPaymentReference =
    getSuccessfulTransactionCode(input.checkout) ||
    input.checkout.checkout_reference ||
    input.checkoutId;
  const amountPaid = formatPaidAmount(
    input.checkout.amount ?? pendingCheckout.amount,
    input.checkout.currency ?? "GBP",
  );

  if (pendingCheckout.finalizedAt) {
    const existingBooking = bookingRef
      ? await getPaidBookingRecord(input.env.TRACKING_STORE, bookingRef)
      : null;
    return {
      ok: true,
      paid: true,
      alreadyFinalized: true,
      amendmentCommitted: true,
      amountPaid,
      paymentReference: pendingCheckout.paymentReference || topUpPaymentReference,
      bookingPaymentReference: bookingRef,
      // Already finalized — do not imply a fresh email was sent on this callback.
      customerEmailSent: Boolean(existingBooking?.lastUpdatedConfirmationSentAt),
      booking: existingBooking ? amendmentBookingSnapshot(existingBooking) : undefined,
    };
  }

  const booking = await getPaidBookingRecord(input.env.TRACKING_STORE, bookingRef);
  if (!booking) {
    await markPendingCheckoutFinalized(
      input.env.TRACKING_STORE,
      input.checkoutId,
      topUpPaymentReference,
    );
    return {
      ok: false,
      paid: true,
      amountPaid,
      paymentReference: topUpPaymentReference,
      bookingPaymentReference: bookingRef,
      customerEmailSent: false,
      abandonedWithoutCommit: true,
      error: "Booking not found for amendment top-up",
    };
  }

  // Idempotent: top-up already recorded on this booking.
  const alreadyPaid = (booking.additionalPayments ?? []).some(
    (p) => p.checkoutId === input.checkoutId || p.amendmentId === amendmentId,
  );
  if (alreadyPaid || booking.pendingAmendment?.status === "committed") {
    await markPendingCheckoutFinalized(
      input.env.TRACKING_STORE,
      input.checkoutId,
      topUpPaymentReference,
    );
    return {
      ok: true,
      paid: true,
      alreadyFinalized: true,
      amendmentCommitted: true,
      amountPaid,
      paymentReference: topUpPaymentReference,
      bookingPaymentReference: bookingRef,
      customerEmailSent: Boolean(booking.lastUpdatedConfirmationSentAt),
      booking: amendmentBookingSnapshot(booking),
    };
  }

  const pending = booking.pendingAmendment;
  const validation = validatePendingAmendmentForPayment({
    booking,
    amendmentId: amendmentId || pending?.amendmentId,
  });

  // Payment succeeded but amendment no longer valid — do not mutate journey; flag owner.
  if (!validation.ok || !pending) {
    await updatePaidBookingFields(
      input.env.TRACKING_STORE,
      bookingRef,
      {
        pendingAmendment: pending
          ? { ...pending, status: "abandoned" }
          : null,
        refundDueAmount: pendingCheckout.amount,
        refundDueReason: `Amendment top-up ${topUpPaymentReference} paid but amendment invalid (${validation.ok ? "missing" : validation.reason}) — refund customer top-up`,
        refundDueAt: new Date().toISOString(),
      },
      { appendAudit: true, changedBy: "System" },
    );
    await markPendingCheckoutFinalized(
      input.env.TRACKING_STORE,
      input.checkoutId,
      topUpPaymentReference,
    );
    return {
      ok: false,
      paid: true,
      amountPaid,
      paymentReference: topUpPaymentReference,
      bookingPaymentReference: bookingRef,
      customerEmailSent: false,
      abandonedWithoutCommit: true,
      error: validation.ok
        ? "Pending amendment missing"
        : validation.message,
    };
  }

  const newTripDate = String(pending.proposed.tripDate || booking.tripDate);
  const newTripTime = String(pending.proposed.tripTime || booking.tripTime);
  const newPickupLabel = String(pending.proposed.pickupLabel || booking.pickupLabel);
  const newDropoffLabel = String(pending.proposed.dropoffLabel || booking.dropoffLabel);
  const newPassengers =
    pending.proposed.passengers !== undefined && pending.proposed.passengers !== null
      ? Number(pending.proposed.passengers)
      : booking.passengers;
  const newSuitcases =
    pending.proposed.suitcases !== undefined && pending.proposed.suitcases !== null
      ? Number(pending.proposed.suitcases)
      : booking.suitcases;
  const newChildSeats =
    pending.proposed.childSeats !== undefined && pending.proposed.childSeats !== null
      ? Number(pending.proposed.childSeats)
      : booking.childSeats;
  const newChildSeatNotes =
    pending.proposed.childSeatNotes !== undefined
      ? String(pending.proposed.childSeatNotes || "")
      : booking.childSeatNotes;
  const newFlightNumber =
    pending.proposed.flightNumber !== undefined
      ? String(pending.proposed.flightNumber || "")
      : booking.flightNumber;
  const newMobileNumber =
    pending.proposed.mobileNumber !== undefined
      ? String(pending.proposed.mobileNumber || "")
      : booking.mobileNumber;
  const previousTripDate = booking.tripDate;
  const previousTripTime = booking.tripTime;
  const changedAt = new Date().toISOString();
  const previousAdditional = booking.additionalPayments ?? [];
  const topUpAmount = Math.round(Number(pending.additionalPaymentAmount) * 100) / 100;
  const grossBefore = grossAmountCollectedOf(booking);
  const priorAdditionalSum = previousAdditional.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const originalAmount =
    typeof booking.originalAmount === "number" && Number.isFinite(booking.originalAmount)
      ? booking.originalAmount
      : Math.round((grossBefore - priorAdditionalSum) * 100) / 100;
  const totalPaid = Math.round((grossBefore + topUpAmount) * 100) / 100;
  const additionalEntry: PaidBookingAdditionalPayment = {
    amount: topUpAmount,
    checkoutId: input.checkoutId,
    paymentReference: topUpPaymentReference,
    amendmentId: pending.amendmentId,
    paidAt: changedAt,
    transactionId: getSuccessfulTransactionId(input.checkout) || undefined,
    transactionCode: getSuccessfulTransactionCode(input.checkout) || undefined,
  };

  const historyEntry: DateTimeAmendmentAuditEntry = {
    changedAt,
    previousTripDate,
    previousTripTime,
    newTripDate,
    newTripTime,
    changedBy: "Customer",
    farePreserved: false,
    previousFare: pending.previousFare,
    newFare: pending.newFare,
    notes: `Higher-fare amendment top-up paid (${topUpPaymentReference})`,
  };

  const amendmentEvent: PaidBookingAmendmentEvent = {
    amendmentId: pending.amendmentId,
    changedAt,
    changedBy: "Customer",
    before: {
      tripDate: previousTripDate,
      tripTime: previousTripTime,
      pickupLabel: booking.pickupLabel,
      dropoffLabel: booking.dropoffLabel,
      passengers: booking.passengers,
      suitcases: booking.suitcases,
      childSeats: booking.childSeats,
      flightNumber: booking.flightNumber,
      mobileNumber: booking.mobileNumber,
      amount: pending.previousFare,
    },
    after: {
      tripDate: newTripDate,
      tripTime: newTripTime,
      pickupLabel: newPickupLabel,
      dropoffLabel: newDropoffLabel,
      passengers: newPassengers,
      suitcases: newSuitcases,
      childSeats: newChildSeats,
      flightNumber: newFlightNumber,
      mobileNumber: newMobileNumber,
      amount: pending.newFare,
    },
    previousFare: pending.previousFare,
    newFare: pending.newFare,
    difference: topUpAmount,
    additionalPaymentAmount: topUpAmount,
    additionalPaymentReference: topUpPaymentReference,
    idempotencyKey: pending.idempotencyKey,
  };

  const updated = await updatePaidBookingFields(
    input.env.TRACKING_STORE,
    bookingRef,
    {
      tripDate: newTripDate,
      tripTime: newTripTime,
      pickupLabel: newPickupLabel,
      dropoffLabel: newDropoffLabel,
      passengers: newPassengers,
      suitcases: newSuitcases,
      childSeats: newChildSeats,
      childSeatNotes: newChildSeatNotes,
      flightNumber: newFlightNumber,
      mobileNumber: newMobileNumber,
      originalTripDate: booking.originalTripDate || previousTripDate,
      originalTripTime: booking.originalTripTime || previousTripTime,
      dateTimeAmendmentCount: Math.max(0, Number(booking.dateTimeAmendmentCount) || 0) + 1,
      dateTimeAmendmentHistory: [...(booking.dateTimeAmendmentHistory ?? []), historyEntry],
      amendmentHistory: [...(booking.amendmentHistory ?? []), amendmentEvent],
      originalAmount,
      additionalPayments: [...previousAdditional, additionalEntry],
      amount: pending.newFare,
      amountPaidLabel: formatPaidAmount(totalPaid),
      pendingAmendment: { ...pending, status: "committed" },
    },
    { appendAudit: true, changedBy: "Customer" },
  );

  if (!updated) {
    return {
      ok: false,
      paid: true,
      amountPaid,
      paymentReference: topUpPaymentReference,
      bookingPaymentReference: bookingRef,
      customerEmailSent: false,
      error: "Could not commit amendment after payment",
    };
  }

  // Clear pending after commit (status committed kept in history via amendmentHistory).
  await updatePaidBookingFields(
    input.env.TRACKING_STORE,
    bookingRef,
    { pendingAmendment: null },
    { appendAudit: false },
  );

  if (trackingStoreConfigured(input.env.TRACKING_STORE)) {
    const token = updated.trackingToken?.trim();
    let job = token ? await getTrackingJob(input.env.TRACKING_STORE, token) : null;
    if (!job) {
      job = await findTrackingJobByPaymentReference(input.env.TRACKING_STORE, bookingRef);
    }
    if (job) {
      const prevDate = job.tripDate;
      job.tripDate = newTripDate;
      job.tripTime = newTripTime;
      job.pickupLabel = newPickupLabel;
      job.dropoffLabel = newDropoffLabel;
      const pickupAt = buildPickupDateTimeLocal(job.tripDate, job.tripTime);
      if (pickupAt) job.pickupAt = pickupAt;
      await saveTrackingJob(input.env.TRACKING_STORE, job);
      if (job.tripDate !== prevDate) {
        await reindexTrackingJobDate(input.env.TRACKING_STORE, job.token, prevDate, job.tripDate);
      }
    }
  }

  if (
    input.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() &&
    input.env.GOOGLE_CALENDAR_ID?.trim() &&
    updated.calendarEventIds.length > 0
  ) {
    try {
      const serviceAccount = parseServiceAccountJson(
        input.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON,
      );
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const startDateTime = `${newTripDate}T${newTripTime}`;
      await rescheduleCalendarEvents(
        accessToken,
        input.env.GOOGLE_CALENDAR_ID.trim(),
        updated.calendarEventIds,
        {
          startDateTime,
          endDateTime: transferEventEndDateTime(startDateTime),
          location: updated.pickupLabel,
          updateNote:
            `Amended after top-up payment ${topUpPaymentReference}\n` +
            `Was: ${previousTripDate} ${previousTripTime}\nNow: ${newTripDate} ${newTripTime}\n` +
            `Fare: £${pending.previousFare.toFixed(2)} → £${pending.newFare.toFixed(2)}\n`,
        },
      );
    } catch {
      // Calendar failure must not undo payment/commit.
    }
  }

  const emailResult = await sendUpdatedConfirmationForPaymentReference({
    env: input.env,
    paymentReference: bookingRef,
    whatChanged: ["Pickup date changed", "Pickup time changed"],
    fareNote: `Additional payment received: £${topUpAmount.toFixed(2)}`,
    amendmentId: pending.amendmentId,
  });

  await markPendingCheckoutFinalized(
    input.env.TRACKING_STORE,
    input.checkoutId,
    topUpPaymentReference,
  );

  const fresh =
    (await getPaidBookingRecord(input.env.TRACKING_STORE, bookingRef)) || updated;

  return {
    ok: true,
    paid: true,
    amendmentCommitted: true,
    amountPaid,
    paymentReference: topUpPaymentReference,
    bookingPaymentReference: bookingRef,
    customerEmailSent: Boolean(emailResult?.sent),
    emailWarning: emailResult?.sent ? undefined : emailResult?.error,
    booking: amendmentBookingSnapshot(fresh),
  };
}
