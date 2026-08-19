/**
 * Customer self-service date/time amendments for paid bookings.
 * Server-side 24h gate (Europe/London). Fare preserved for one free change
 * when pickup/destination/party are unchanged.
 */

import {
  FREE_AMENDMENT_HINT,
  WITHIN_24H_AMENDMENT_BODY,
  WITHIN_24H_AMENDMENT_HEADLINE,
  evaluateCustomerDateTimeAmendment,
  isValidScheduleDate,
  isValidScheduleTime,
  normalizeScheduleDate,
  normalizeScheduleTime,
  type DateTimeAmendmentAuditEntry,
} from "../shared/booking-amendment";
import { hoursUntilPickup, isWithin24HoursOfPickup } from "../shared/refund-ops";
import { corsHeaders } from "../shared/google-places";
import { buildUpdatedBookingConfirmationEmail } from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { buildPickupDateTimeLocal, journeyStatusOf } from "../shared/tracking";
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
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  reindexTrackingJobDate,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";
import { resolvePaidBookingTrackUrl } from "./paid-booking-handlers";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
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
  return {
    paymentReference: record.paymentReference,
    customerName: record.customerName,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    amountPaidLabel: record.amountPaidLabel,
    dateTimeAmendmentCount: used,
    freeAmendmentAvailable: !within24h && used < 1,
    within24HoursOfPickup: within24h,
    hoursUntilPickup: hoursUntilPickup(record.tripDate, record.tripTime),
    originalTripDate: record.originalTripDate,
    originalTripTime: record.originalTripTime,
    dateTimeAmendmentHistory: record.dateTimeAmendmentHistory ?? [],
    within24hHeadline: WITHIN_24H_AMENDMENT_HEADLINE,
    within24hBody: WITHIN_24H_AMENDMENT_BODY,
    freeAmendmentHint: FREE_AMENDMENT_HINT,
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
  const historyEntry: DateTimeAmendmentAuditEntry = {
    changedAt,
    previousTripDate,
    previousTripTime,
    newTripDate,
    newTripTime,
    changedBy: "Customer",
    farePreserved: true,
    notes: "Free customer date/time amendment (>24h notice)",
  };

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
            `Fare preserved (free date/time amendment)\n`,
        },
      );
      if (result.errors.length > 0) {
        warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Calendar update failed");
    }
  }

  try {
    const trackUrl = await resolvePaidBookingTrackUrl(env.TRACKING_STORE, updated);
    const email = buildUpdatedBookingConfirmationEmail(
      {
        customerName: updated.customerName,
        customerEmail: updated.customerEmail,
        mobileNumber: updated.mobileNumber,
        tripLabel: updated.tripLabel,
        pickupLabel: updated.pickupLabel,
        dropoffLabel: updated.dropoffLabel,
        returnJourney: updated.returnJourney,
        tripDate: updated.tripDate,
        tripTime: updated.tripTime,
        returnDate: updated.returnDate ?? "",
        returnTime: updated.returnTime ?? "",
        flightNumber: updated.flightNumber ?? "",
        returnFlightNumber: updated.returnFlightNumber,
        passengers: updated.passengers ?? 1,
        suitcases: updated.suitcases ?? 0,
        vehicle: updated.vehicle ?? "Saloon",
        isAirportTrip: Boolean(updated.isAirportTrip),
        airportCode: updated.airportCode,
        isFromAirport: updated.isFromAirport,
        amountPaid: updated.amountPaidLabel,
        paymentReference: updated.paymentReference,
        transactionCode: updated.transactionCode,
      },
      BUSINESS_NAME,
      { trackUrl: trackUrl || undefined },
    );
    await trySendBrandedCustomerEmail(env, {
      to: updated.customerEmail,
      toName: updated.customerName,
      subject: email.subject,
      body: email.text,
      htmlBody: email.html,
    });
  } catch (err) {
    warnings.push(
      err instanceof Error ? `Confirmation email: ${err.message}` : "Confirmation email failed",
    );
  }

  return jsonResponse(
    {
      ok: true,
      farePreserved: true,
      booking: publicAmendmentSummary(updated),
      warnings: warnings.length ? warnings : undefined,
    },
    200,
    origin,
  );
}
