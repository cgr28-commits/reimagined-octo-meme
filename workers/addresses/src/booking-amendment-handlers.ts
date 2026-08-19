/**
 * Customer self-service date/time amendments for paid bookings.
 * Server-side 24h gate (Europe/London). Fare preserved for one free change
 * when pickup/destination/party are unchanged.
 */

import {
  CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
  FREE_AMENDMENT_HINT,
  WITHIN_24H_AMENDMENT_BODY,
  WITHIN_24H_AMENDMENT_HEADLINE,
  buildHigherFarePendingAmendment,
  describeFareDifference,
  evaluateCustomerDateTimeAmendment,
  generateAmendmentId,
  isValidScheduleDate,
  isValidScheduleTime,
  normalizeScheduleDate,
  normalizeScheduleTime,
  validatePendingAmendmentForPayment,
  type DateTimeAmendmentAuditEntry,
} from "../shared/booking-amendment";
import { hoursUntilPickup, isWithin24HoursOfPickup } from "../shared/refund-ops";
import { corsHeaders } from "../shared/google-places";
import type { PaidBookingAmendmentEvent, PaidBookingRecord } from "../shared/paid-booking-record";
import {
  buildLowerFareAmendmentFareNote,
  grossAmountCollectedOf,
  refundDueToAlignWithJourneyFare,
} from "../shared/paid-booking-record";
import { buildPickupDateTimeLocal, journeyStatusOf } from "../shared/tracking";
import {
  calculateAuthoritativeWebsiteQuote,
  type QuoteServiceAirportCode,
} from "../../../src/lib/quote-service";
import {
  getGoogleAccessToken,
  parseServiceAccountJson,
  rescheduleCalendarEvents,
  transferEventEndDateTime,
} from "./google-calendar";
import {
  getPaidBookingRecord,
  paidBookingStoreConfigured,
  updatePaidBookingFields,
} from "./paid-booking-store";
import { getPendingCheckout } from "./pending-checkout-store";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  reindexTrackingJobDate,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { type WorkerEmailEnv } from "./worker-email";
import { sendUpdatedConfirmationForPaymentReference } from "./send-updated-confirmation";
import { createOrReuseAmendmentTopUpCheckout } from "./amendment-topup";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  SITE_ORIGIN?: string;
};

const BUSINESS_NAME = "My Airport Taxi NI";

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function calendarConfigured(env: Env): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

function publicAmendmentSummary(record: PaidBookingRecord) {
  const within24h = isWithin24HoursOfPickup(record.tripDate, record.tripTime);
  const used = Math.max(0, Math.floor(Number(record.dateTimeAmendmentCount) || 0));
  const pending = record.pendingAmendment;
  return {
    paymentReference: record.paymentReference,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    /** Gross money collected (not rewritten on lower-fare until refunded). */
    amountPaidLabel: record.amountPaidLabel,
    /** Current journey / agreed fare. */
    journeyFare: record.amount,
    journeyFareLabel: `£${Number(record.amount || 0).toFixed(2)}`,
    refundDueAmount: record.refundDueAmount ?? 0,
    amountRefunded: record.amountRefunded ?? 0,
    dateTimeAmendmentCount: used,
    freeAmendmentAvailable: !within24h && used < 1 && pending?.status !== "awaiting_payment",
    within24HoursOfPickup: within24h,
    hoursUntilPickup: hoursUntilPickup(record.tripDate, record.tripTime),
    originalTripDate: record.originalTripDate,
    originalTripTime: record.originalTripTime,
    dateTimeAmendmentHistory: record.dateTimeAmendmentHistory ?? [],
    within24hHeadline: WITHIN_24H_AMENDMENT_HEADLINE,
    within24hBody: WITHIN_24H_AMENDMENT_BODY,
    freeAmendmentHint: FREE_AMENDMENT_HINT,
    pendingAmendment:
      pending && pending.status === "awaiting_payment"
        ? {
            amendmentId: pending.amendmentId,
            previousFare: pending.previousFare,
            newFare: pending.newFare,
            additionalPaymentAmount: pending.additionalPaymentAmount,
            expiresAt: pending.expiresAt,
            status: pending.status,
            paymentUrl: pending.paymentUrl,
          }
        : null,
    selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
    lastUpdatedConfirmationSentAt: record.lastUpdatedConfirmationSentAt,
    lastUpdatedConfirmationError: record.lastUpdatedConfirmationError,
  };
}

export function isPaidBookingAmendLookupPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/amend-lookup" ||
    pathname === "/api/paid-bookings/amend-lookup"
  );
}

export function isPaidBookingAmendSchedulePath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/amend-schedule" ||
    pathname === "/api/paid-bookings/amend-schedule"
  );
}

export function isPaidBookingAmendPayPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/amend-pay" || pathname === "/api/paid-bookings/amend-pay"
  );
}

export function isPaidBookingAmendReturnPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/amend-return" ||
    pathname === "/api/paid-bookings/amend-return"
  );
}

/** POST — lookup booking for manage-booking UI (ref + email). */
export async function handleCustomerAmendLookup(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  if (!paymentReference || !customerEmail) {
    return jsonResponse(
      { error: "Booking reference and email are required." },
      400,
      origin,
    );
  }

  const record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!record || !emailsMatch(record.customerEmail, customerEmail)) {
    return jsonResponse(
      { error: "We could not find a booking with that reference and email." },
      404,
      origin,
    );
  }

  return jsonResponse({ ok: true, booking: publicAmendmentSummary(record) }, 200, origin);
}

/** POST — customer date/time amendment (server-enforced 24h + free quota). */
export async function handleCustomerAmendSchedule(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  const newTripDate = normalizeScheduleDate(String(body.tripDate ?? ""));
  const newTripTime = normalizeScheduleTime(String(body.tripTime ?? ""));

  if (!paymentReference || !customerEmail) {
    return jsonResponse(
      { error: "Booking reference and email are required." },
      400,
      origin,
    );
  }
  if (!isValidScheduleDate(newTripDate) || !isValidScheduleTime(newTripTime)) {
    return jsonResponse({ error: "Please enter a valid pickup date and time." }, 400, origin);
  }

  const record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!record || !emailsMatch(record.customerEmail, customerEmail)) {
    return jsonResponse(
      { error: "We could not find a booking with that reference and email." },
      404,
      origin,
    );
  }

  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token = record.trackingToken?.trim();
    let job = token ? await getTrackingJob(env.TRACKING_STORE, token) : null;
    if (!job) {
      job = await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference);
    }
    if (job && journeyStatusOf(job) === "completed") {
      return jsonResponse(
        { error: "This journey has already been completed and cannot be changed online." },
        409,
        origin,
      );
    }
  }

  const decision = evaluateCustomerDateTimeAmendment({
    booking: {
      tripDate: record.tripDate,
      tripTime: record.tripTime,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      passengers: record.passengers,
      suitcases: record.suitcases,
      returnJourney: record.returnJourney,
      status: record.status,
      operationalStatus: record.operationalStatus,
      paymentStatus: record.paymentStatus,
      dateTimeAmendmentCount: record.dateTimeAmendmentCount,
      amountRefunded: record.amountRefunded,
      amount: record.amount,
    },
    newTripDate,
    newTripTime,
    proposedPickupLabel:
      body.pickupLabel !== undefined ? String(body.pickupLabel) : undefined,
    proposedDropoffLabel:
      body.dropoffLabel !== undefined ? String(body.dropoffLabel) : undefined,
    proposedPassengers:
      body.passengers !== undefined ? Number(body.passengers) : undefined,
    proposedSuitcases:
      body.suitcases !== undefined ? Number(body.suitcases) : undefined,
  });

  if (!decision.ok) {
    const status =
      decision.reason === "within_24_hours"
        ? 403
        : decision.reason === "free_quota_exhausted"
          ? 409
          : decision.reason === "material_journey_change"
            ? 422
            : 400;
    return jsonResponse(
      {
        error: decision.message,
        reason: decision.reason,
        contactRequired: Boolean(decision.contactRequired),
        within24HoursOfPickup: decision.reason === "within_24_hours",
        headline:
          decision.reason === "within_24_hours" ? WITHIN_24H_AMENDMENT_HEADLINE : undefined,
        body: decision.reason === "within_24_hours" ? WITHIN_24H_AMENDMENT_BODY : undefined,
        booking: publicAmendmentSummary(record),
      },
      status,
      origin,
    );
  }

  const previousTripDate = record.tripDate;
  const previousTripTime = record.tripTime;
  const changedAt = new Date().toISOString();
  const amendmentId = generateAmendmentId();

  // Always reprice server-side (weekday/weekend/bank holiday may differ).
  // Client amount / authoritativeFare / newFare are ignored if present.
  const airportRaw = String(record.airportCode ?? "").trim().toUpperCase();
  const airportCode =
    airportRaw === "BFS" || airportRaw === "BHD" || airportRaw === "DUB" || airportRaw === "LDY"
      ? (airportRaw as QuoteServiceAirportCode)
      : null;
  const quote = calculateAuthoritativeWebsiteQuote({
    airportCode: record.isAirportTrip || airportCode ? airportCode : null,
    fromAirport: Boolean(record.isFromAirport),
    pickupAddress: record.pickupLabel,
    dropoffAddress: record.dropoffLabel,
    returnJourney: Boolean(record.returnJourney),
    outboundDate: newTripDate,
    outboundTime: newTripTime,
    returnDate: record.returnDate,
    returnTime: record.returnTime,
    passengers: record.passengers ?? 1,
    suitcases: record.suitcases ?? 0,
  });

  if (!quote.ok) {
    return jsonResponse(
      {
        error:
          quote.message ||
          "We could not recalculate this journey online. Please contact My Airport Taxi NI.",
        reason: "capacity_not_online",
        contactRequired: true,
        booking: publicAmendmentSummary(record),
      },
      422,
      origin,
    );
  }

  const previousFare = Number(record.amount) || 0;
  const newFare = quote.amount;
  const fareDiff = describeFareDifference(previousFare, newFare);

  // Higher fare: do not mutate the confirmed booking until extra SumUp payment succeeds.
  if (fareDiff.kind === "additional_payment") {
    const pending = buildHigherFarePendingAmendment({
      paymentReference,
      amendmentId,
      previousFare,
      newFare,
      proposed: {
        tripDate: newTripDate,
        tripTime: newTripTime,
      },
      createdBy: "Customer",
    });
    await updatePaidBookingFields(
      env.TRACKING_STORE,
      paymentReference,
      { pendingAmendment: pending },
      { appendAudit: false },
    );

    const originUrl = new URL(request.url);
    const siteOrigin =
      request.headers.get("Origin")?.replace(/\/$/, "") ||
      env.SITE_ORIGIN?.replace(/\/$/, "") ||
      "https://www.myairporttaxini.co.uk";
    const redirectUrl = `${siteOrigin}/manage-booking/?amendment=return&ref=${encodeURIComponent(paymentReference)}`;
    const returnUrl = `${originUrl.origin}/payments/webhook`;

    const fresh = (await getPaidBookingRecord(env.TRACKING_STORE, paymentReference)) || record;
    const topUp = await createOrReuseAmendmentTopUpCheckout({
      env: { ...env, TRACKING_STORE: env.TRACKING_STORE },
      booking: fresh,
      pending: fresh.pendingAmendment || pending,
      redirectUrl,
      returnUrl,
    });

    if (!topUp.ok) {
      return jsonResponse(
        {
          ok: false,
          reason: "additional_payment_required",
          message: fareDiff.label,
          fare: fareDiff,
          pendingAmendment: pending,
          booking: publicAmendmentSummary(fresh),
          contactRequired: true,
          paymentError: topUp.message,
          note: "Your existing booking will remain unchanged until the additional payment is completed.",
          selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
        },
        402,
        origin,
      );
    }

    return jsonResponse(
      {
        ok: false,
        reason: "additional_payment_required",
        message: fareDiff.label,
        fare: {
          ...fareDiff,
          previousFareLabel: `£${fareDiff.previousFare.toFixed(2)}`,
          newFareLabel: `£${fareDiff.newFare.toFixed(2)}`,
          differenceLabel: `£${fareDiff.difference.toFixed(2)}`,
        },
        pendingAmendment: topUp.pending,
        paymentUrl: topUp.paymentUrl,
        checkoutId: topUp.checkoutId,
        checkoutReference: topUp.checkoutReference,
        amountDue: topUp.amount,
        amountDueLabel: `£${topUp.amount.toFixed(2)}`,
        booking: publicAmendmentSummary(
          (await getPaidBookingRecord(env.TRACKING_STORE, paymentReference)) || fresh,
        ),
        note: "Your existing booking will remain unchanged until the additional payment is completed.",
        payCtaLabel: `Pay £${topUp.amount.toFixed(2)} & Confirm Change`,
        selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
      },
      402,
      origin,
    );
  }

  const historyEntry: DateTimeAmendmentAuditEntry = {
    changedAt,
    previousTripDate,
    previousTripTime,
    newTripDate,
    newTripTime,
    changedBy: "Customer",
    farePreserved: false,
    previousFare,
    newFare,
    notes:
      fareDiff.kind === "none"
        ? "Customer schedule amendment — fare unchanged after authoritative reprice"
        : `Customer schedule amendment — refund due £${fareDiff.difference.toFixed(2)} (owner-controlled)`,
  };

  const amendmentEvent: PaidBookingAmendmentEvent = {
    amendmentId,
    changedAt,
    changedBy: "Customer",
    before: {
      tripDate: previousTripDate,
      tripTime: previousTripTime,
      amount: previousFare,
    },
    after: {
      tripDate: newTripDate,
      tripTime: newTripTime,
      amount: newFare,
    },
    previousFare,
    newFare,
    difference: fareDiff.kind === "refund_due" ? -fareDiff.difference : 0,
    refundAmount: fareDiff.kind === "refund_due" ? fareDiff.difference : undefined,
    idempotencyKey: `amend:${paymentReference}:${amendmentId}`,
  };

  /**
   * Lower fare: commit journey fare + flag refundDueAmount for owner-controlled
   * partial refund. Do NOT rewrite amountPaidLabel to the new fare — the customer
   * has still paid the gross collected amount until SumUp refund succeeds.
   */
  const collected = grossAmountCollectedOf(record);
  const refundDueFields =
    fareDiff.kind === "refund_due"
      ? {
          amount: newFare,
          originalAmount: record.originalAmount ?? collected,
          refundDueAmount: refundDueToAlignWithJourneyFare(
            {
              ...record,
              amount: newFare,
              originalAmount: record.originalAmount ?? collected,
            },
            newFare,
          ),
          refundDueReason: `Schedule amendment ${amendmentId}: journey £${previousFare.toFixed(2)} → £${newFare.toFixed(2)} (collected £${collected.toFixed(2)})`,
          refundDueAt: changedAt,
        }
      : fareDiff.kind === "none"
        ? {}
        : {};

  const updated = await updatePaidBookingFields(
    env.TRACKING_STORE,
    paymentReference,
    {
      tripDate: newTripDate,
      tripTime: newTripTime,
      originalTripDate: record.originalTripDate || previousTripDate,
      originalTripTime: record.originalTripTime || previousTripTime,
      dateTimeAmendmentCount: Math.max(0, Number(record.dateTimeAmendmentCount) || 0) + 1,
      dateTimeAmendmentHistory: [...(record.dateTimeAmendmentHistory ?? []), historyEntry],
      amendmentHistory: [...(record.amendmentHistory ?? []), amendmentEvent],
      pendingAmendment: null,
      ...refundDueFields,
    },
    { appendAudit: true, changedBy: "Customer" },
  );

  if (!updated) {
    return jsonResponse({ error: "Could not update this booking." }, 500, origin);
  }

  const warnings: string[] = [];

  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token = updated.trackingToken?.trim();
    let job = token ? await getTrackingJob(env.TRACKING_STORE, token) : null;
    if (!job) {
      job = await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference);
    }
    if (job) {
      const prevDate = job.tripDate;
      job.tripDate = updated.tripDate;
      job.tripTime = updated.tripTime;
      const pickupAt = buildPickupDateTimeLocal(job.tripDate, job.tripTime);
      if (pickupAt) {
        job.pickupAt = pickupAt;
      }
      await saveTrackingJob(env.TRACKING_STORE, job);
      if (job.tripDate !== prevDate) {
        await reindexTrackingJobDate(env.TRACKING_STORE, job.token, prevDate, job.tripDate);
      }
    }
  }

  if (calendarConfigured(env) && updated.calendarEventIds.length > 0) {
    try {
      const serviceAccount = parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!);
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const startDateTime = `${updated.tripDate}T${updated.tripTime}`;
      const result = await rescheduleCalendarEvents(
        accessToken,
        env.GOOGLE_CALENDAR_ID!.trim(),
        updated.calendarEventIds,
        {
          startDateTime,
          endDateTime: transferEventEndDateTime(startDateTime),
          location: updated.pickupLabel,
          updateNote:
            `Updated via customer amendment at ${changedAt}\n` +
            `Payment reference preserved: ${updated.paymentReference}\n` +
            `Was: ${previousTripDate} ${previousTripTime}\nNow: ${updated.tripDate} ${updated.tripTime}\n` +
            `Authoritative reprice: £${previousFare.toFixed(2)} → £${newFare.toFixed(2)}\n`,
        },
      );
      if (result.errors.length > 0) {
        warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Calendar update failed");
    }
  }

  const fareNote =
    fareDiff.kind === "refund_due"
      ? buildLowerFareAmendmentFareNote({
          newFare,
          refundDue: fareDiff.difference,
        })
      : fareDiff.kind === "none"
        ? "No change to your fare"
        : `Updated journey price: £${newFare.toFixed(2)}`;

  const emailResult = await sendUpdatedConfirmationForPaymentReference({
    env: env as Env & { TRACKING_STORE: KVNamespace },
    paymentReference,
    whatChanged: ["Pickup date changed", "Pickup time changed"],
    fareNote,
    amendmentId,
  });

  if (!emailResult?.sent) {
    warnings.push(emailResult?.error || "Confirmation email failed");
  }

  const fresh = (await getPaidBookingRecord(env.TRACKING_STORE, paymentReference)) || updated;

  return jsonResponse(
    {
      ok: true,
      farePreserved: false,
      fare: fareDiff,
      amendmentId,
      customerEmailSent: Boolean(emailResult?.sent),
      customerEmailError: emailResult?.sent ? undefined : emailResult?.error,
      confirmationPickupLabel: fresh.pickupLabel,
      booking: publicAmendmentSummary(fresh),
      warnings: warnings.length ? warnings : undefined,
      emailUi: emailResult?.sent
        ? {
            headline: "Your booking has been updated.",
            body: `We’ve emailed your updated confirmation to ${fresh.customerEmail}.`,
          }
        : {
            headline: "Your booking has been updated.",
            body: "Your booking has been updated, but we couldn’t send the confirmation email. Please contact us if you need a copy.",
          },
    },
    200,
    origin,
  );
}

/**
 * POST — create or reuse SumUp top-up checkout for an existing pendingAmendment.
 * Used when the customer returns to Manage Booking to finish paying.
 */
export async function handleCustomerAmendPay(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  const amendmentId = String(body.amendmentId ?? "").trim() || undefined;
  if (!paymentReference || !customerEmail) {
    return jsonResponse(
      { error: "Booking reference and email are required." },
      400,
      origin,
    );
  }

  const record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!record || !emailsMatch(record.customerEmail, customerEmail)) {
    return jsonResponse(
      { error: "We could not find a booking with that reference and email." },
      404,
      origin,
    );
  }

  const validation = validatePendingAmendmentForPayment({ booking: record, amendmentId });
  if (!validation.ok) {
    if (validation.reason === "expired" && record.pendingAmendment) {
      await updatePaidBookingFields(
        env.TRACKING_STORE,
        paymentReference,
        { pendingAmendment: { ...record.pendingAmendment, status: "expired" } },
        { appendAudit: false },
      );
    }
    return jsonResponse(
      {
        error: validation.message,
        reason: validation.reason,
        contactRequired: validation.reason === "within_24_hours",
        booking: publicAmendmentSummary(record),
      },
      validation.reason === "within_24_hours" ? 403 : 409,
      origin,
    );
  }

  const originUrl = new URL(request.url);
  const siteOrigin =
    request.headers.get("Origin")?.replace(/\/$/, "") ||
    env.SITE_ORIGIN?.replace(/\/$/, "") ||
    "https://www.myairporttaxini.co.uk";
  const redirectUrl = `${siteOrigin}/manage-booking/?amendment=return&ref=${encodeURIComponent(paymentReference)}`;
  const returnUrl = `${originUrl.origin}/payments/webhook`;

  const topUp = await createOrReuseAmendmentTopUpCheckout({
    env: { ...env, TRACKING_STORE: env.TRACKING_STORE },
    booking: validation.booking,
    pending: validation.pending,
    redirectUrl,
    returnUrl,
  });

  if (!topUp.ok) {
    return jsonResponse(
      { error: topUp.message, reason: topUp.reason, booking: publicAmendmentSummary(record) },
      502,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      paymentUrl: topUp.paymentUrl,
      checkoutId: topUp.checkoutId,
      amountDue: topUp.amount,
      amountDueLabel: `£${topUp.amount.toFixed(2)}`,
      payCtaLabel: `Pay £${topUp.amount.toFixed(2)} & Confirm Change`,
      pendingAmendment: topUp.pending,
      fare: {
        previousFare: topUp.pending.previousFare,
        newFare: topUp.pending.newFare,
        difference: topUp.amount,
        previousFareLabel: `£${topUp.pending.previousFare.toFixed(2)}`,
        newFareLabel: `£${topUp.pending.newFare.toFixed(2)}`,
        differenceLabel: `£${topUp.amount.toFixed(2)}`,
      },
      note: "Your existing booking will remain unchanged until the additional payment is completed.",
      booking: publicAmendmentSummary(
        (await getPaidBookingRecord(env.TRACKING_STORE, paymentReference)) || record,
      ),
      selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
    },
    200,
    origin,
  );
}

/**
 * POST — after SumUp return: resolve booking from amendment-topup checkout id.
 * Does not require customer email in the URL or browser memory.
 */
export async function handleCustomerAmendReturn(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  const checkoutId = String(body.checkoutId ?? body.checkout_id ?? "").trim();
  if (!checkoutId) {
    return jsonResponse({ error: "Missing checkoutId." }, 400, origin);
  }

  const pending = await getPendingCheckout(env.TRACKING_STORE, checkoutId);
  if (!pending || pending.checkoutKind !== "amendment-topup") {
    return jsonResponse(
      { error: "No amendment payment was found for this checkout." },
      404,
      origin,
    );
  }

  const paymentReference = String(pending.amendmentBookingPaymentReference || "").trim();
  if (!paymentReference) {
    return jsonResponse({ error: "Amendment payment is missing its booking link." }, 404, origin);
  }

  const record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!record) {
    return jsonResponse({ error: "Booking not found for this amendment payment." }, 404, origin);
  }

  const committed =
    Boolean(pending.finalizedAt) ||
    (record.additionalPayments ?? []).some((p) => p.checkoutId === checkoutId) ||
    record.pendingAmendment?.status === "committed" ||
    !record.pendingAmendment;

  return jsonResponse(
    {
      ok: true,
      checkoutId,
      finalized: Boolean(pending.finalizedAt),
      amendmentCommitted: committed && record.pendingAmendment?.status !== "awaiting_payment",
      paymentReference: record.paymentReference,
      customerEmailSent: Boolean(record.lastUpdatedConfirmationSentAt),
      customerEmailError: record.lastUpdatedConfirmationError || undefined,
      booking: publicAmendmentSummary(record),
    },
    200,
    origin,
  );
}
