/**
 * Owner-only paid booking edit + optional updated confirmation email.
 * Does not create SumUp charges, refunds, or duplicate bookings.
 */

import {
  buildUpdatedBookingConfirmationEmail,
  type PaidBookingDetails,
  type PaidBookingReceipt,
} from "../shared/booking-notifications";
import {
  PRIMARY_DRIVER_LABEL,
  type PaidBookingRecord,
} from "../shared/paid-booking-record";
import { buildPickupDateTimeLocal, journeyStatusOf } from "../shared/tracking";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
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
  type PaidBookingUpdateFields,
} from "./paid-booking-store";
import { getPendingCheckout, pendingCheckoutStoreConfigured } from "./pending-checkout-store";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  reindexTrackingJobDate,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import {
  trySendBrandedCustomerEmail,
  type WorkerEmailEnv,
} from "./worker-email";
import { resolvePaidBookingTrackUrl } from "./paid-booking-handlers";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
    GOOGLE_CALENDAR_ID?: string;
  };

const BUSINESS_NAME = "My Airport Taxi NI";

const FARE_SENSITIVE_FIELDS = new Set(["pickupLabel", "dropoffLabel", "tripDate", "tripTime"]);

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function calendarConfigured(env: Env): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type OwnerEditBookingBody = {
  paymentReference?: string;
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
  /** When true, send updated confirmation after a successful edit. */
  sendUpdatedConfirmation?: boolean;
};

function recordToDetails(
  record: PaidBookingRecord,
  booking?: PaidBookingDetails,
): PaidBookingDetails {
  if (booking?.customerEmail) {
    return booking;
  }

  return {
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    mobileNumber: record.mobileNumber,
    tripLabel: record.tripLabel,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    returnJourney: record.returnJourney,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    returnDate: record.returnDate ?? "",
    returnTime: record.returnTime ?? "",
    flightNumber: record.flightNumber ?? "",
    returnFlightNumber: record.returnFlightNumber ?? "",
    passengers: record.passengers ?? 1,
    suitcases: record.suitcases ?? 0,
    vehicle: record.vehicle ?? "Saloon",
    journeyDistance: record.journeyDistance,
    journeyDuration: record.journeyDuration,
    isAirportTrip:
      record.isAirportTrip ??
      /airport/i.test(`${record.tripLabel} ${record.pickupLabel} ${record.dropoffLabel}`),
    airportCode: record.airportCode,
    isFromAirport: record.isFromAirport,
    termsAcceptedAt: record.termsAcceptedAt,
    termsVersion: record.termsVersion,
  };
}

function recordToReceipt(
  record: PaidBookingRecord,
  booking?: PaidBookingDetails,
): PaidBookingReceipt {
  return {
    ...recordToDetails(record, booking),
    amountPaid: record.amountPaidLabel,
    paymentReference: record.paymentReference,
    transactionCode: record.transactionCode,
  };
}

async function loadBookingDetails(
  env: Env,
  record: PaidBookingRecord,
): Promise<PaidBookingDetails | undefined> {
  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE) || !record.checkoutId?.trim()) {
    return undefined;
  }
  const pending = await getPendingCheckout(env.TRACKING_STORE, record.checkoutId);
  return pending?.booking;
}

function parseEditFields(body: OwnerEditBookingBody): {
  fields: PaidBookingUpdateFields;
  error?: string;
} {
  const fields: PaidBookingUpdateFields = {};

  if (body.tripDate !== undefined) {
    const tripDate = String(body.tripDate).trim();
    if (!isValidDate(tripDate)) return { fields, error: "Invalid trip date" };
    fields.tripDate = tripDate;
  }
  if (body.tripTime !== undefined) {
    const tripTime = String(body.tripTime).trim();
    if (!isValidTime(tripTime)) return { fields, error: "Invalid trip time" };
    fields.tripTime = tripTime;
  }
  if (body.pickupLabel !== undefined) {
    fields.pickupLabel = String(body.pickupLabel).trim();
  }
  if (body.dropoffLabel !== undefined) {
    fields.dropoffLabel = String(body.dropoffLabel).trim();
  }
  if (body.customerName !== undefined) {
    fields.customerName = String(body.customerName).trim();
  }
  if (body.customerEmail !== undefined) {
    const email = String(body.customerEmail).trim();
    if (!isValidEmail(email)) return { fields, error: "Invalid customer email" };
    fields.customerEmail = email;
  }
  if (body.mobileNumber !== undefined) {
    fields.mobileNumber = String(body.mobileNumber).trim();
  }
  if (body.flightNumber !== undefined) {
    const flight = String(body.flightNumber).trim();
    fields.flightNumber = flight ? flight.toUpperCase() : "";
  }
  if (body.returnFlightNumber !== undefined) {
    const flight = String(body.returnFlightNumber).trim();
    fields.returnFlightNumber = flight ? flight.toUpperCase() : "";
  }
  if (body.passengers !== undefined) {
    const passengers = Number(body.passengers);
    if (!Number.isFinite(passengers) || passengers < 1 || passengers > 16) {
      return { fields, error: "Invalid passenger count" };
    }
    fields.passengers = Math.round(passengers);
  }
  if (body.suitcases !== undefined) {
    const suitcases = Number(body.suitcases);
    if (!Number.isFinite(suitcases) || suitcases < 0 || suitcases > 20) {
      return { fields, error: "Invalid luggage count" };
    }
    fields.suitcases = Math.round(suitcases);
  }
  if (body.childSeats !== undefined) {
    const childSeats = Number(body.childSeats);
    if (!Number.isFinite(childSeats) || childSeats < 0 || childSeats > 8) {
      return { fields, error: "Invalid child-seat count" };
    }
    fields.childSeats = Math.round(childSeats);
  }
  if (body.childSeatNotes !== undefined) {
    fields.childSeatNotes = String(body.childSeatNotes).trim();
  }
  if (body.notes !== undefined) {
    fields.notes = String(body.notes).trim();
  }
  if (body.returnJourney !== undefined) {
    fields.returnJourney = Boolean(body.returnJourney);
  }
  if (body.returnDate !== undefined) {
    const returnDate = String(body.returnDate).trim();
    if (returnDate && !isValidDate(returnDate)) {
      return { fields, error: "Invalid return date" };
    }
    fields.returnDate = returnDate;
  }
  if (body.returnTime !== undefined) {
    const returnTime = String(body.returnTime).trim();
    if (returnTime && !isValidTime(returnTime)) {
      return { fields, error: "Invalid return time" };
    }
    fields.returnTime = returnTime;
  }
  if (body.tripLabel !== undefined) {
    fields.tripLabel = String(body.tripLabel).trim();
  }
  if (body.vehicle !== undefined) {
    fields.vehicle = String(body.vehicle).trim();
  }

  return { fields };
}

export async function handlePaidBookingEditRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to edit bookings." },
      401,
      origin,
    );
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: OwnerEditBookingBody;
  try {
    body = (await request.json()) as OwnerEditBookingBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  if (!paymentReference) {
    return jsonResponse({ error: "Missing paymentReference" }, 400, origin);
  }

  const existing = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!existing) {
    return jsonResponse({ error: `No paid booking found for ${paymentReference}` }, 404, origin);
  }
  if (existing.status === "refunded") {
    return jsonResponse({ error: "Refunded bookings cannot be edited." }, 409, origin);
  }

  // Completed journey protection — do not rewrite historical evidence via normal edit.
  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token = existing.trackingToken?.trim();
    let job = token ? await getTrackingJob(env.TRACKING_STORE, token) : null;
    if (!job) {
      job = await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference);
    }
    if (job && journeyStatusOf(job) === "completed") {
      return jsonResponse(
        {
          error:
            "Completed journeys cannot be rewritten with Edit Booking. Use a separate auditable correction process if needed.",
        },
        409,
        origin,
      );
    }
  }

  const parsed = parseEditFields(body);
  if (parsed.error) {
    return jsonResponse({ error: parsed.error }, 400, origin);
  }

  const fields = parsed.fields;
  if (Object.keys(fields).length === 0) {
    return jsonResponse(
      {
        ok: true,
        paymentReference,
        booking: existing,
        assignedDriver: PRIMARY_DRIVER_LABEL,
        fareMayNeedManualAdjustment: false,
        changes: [],
      },
      200,
      origin,
    );
  }

  const previousTripDate = existing.tripDate;
  const updated = await updatePaidBookingFields(env.TRACKING_STORE, paymentReference, fields, {
    appendAudit: true,
    changedBy: "Owner",
  });

  if (!updated) {
    return jsonResponse({ error: "Could not update booking" }, 500, origin);
  }

  const warnings: string[] = [];
  const fareMayNeedManualAdjustment = Object.keys(fields).some((key) =>
    FARE_SENSITIVE_FIELDS.has(key),
  );

  // Keep tracking job pickup window in sync (same token — no new payment).
  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token = updated.trackingToken?.trim();
    let job = token ? await getTrackingJob(env.TRACKING_STORE, token) : null;
    if (!job) {
      job = await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference);
    }
    if (job) {
      const prevDate = job.tripDate;
      job.customerName = updated.customerName;
      job.customerEmail = updated.customerEmail;
      job.customerMobile = updated.mobileNumber;
      job.pickupLabel = updated.pickupLabel;
      job.dropoffLabel = updated.dropoffLabel;
      job.tripDate = updated.tripDate;
      job.tripTime = updated.tripTime;
      if (updated.flightNumber !== undefined) {
        job.flightNumber = updated.flightNumber || undefined;
      }
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

  // Update existing Google Calendar event(s) — never create duplicates here.
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
            `Updated via owner dashboard at ${new Date().toISOString()}\n` +
            `Payment reference preserved: ${updated.paymentReference}\n` +
            (previousTripDate !== updated.tripDate || existing.tripTime !== updated.tripTime
              ? `Was: ${previousTripDate} ${existing.tripTime}\nNow: ${updated.tripDate} ${updated.tripTime}\n`
              : ""),
        },
      );
      if (result.errors.length > 0) {
        warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Calendar update failed");
    }
  }

  let customerEmailSent = false;
  let customerEmailError: string | undefined;
  if (body.sendUpdatedConfirmation) {
    const bookingDetails = await loadBookingDetails(env, updated);
    const receipt = recordToReceipt(updated, bookingDetails);
    const trackUrl = await resolvePaidBookingTrackUrl(env.TRACKING_STORE, updated);
    const email = buildUpdatedBookingConfirmationEmail(receipt, BUSINESS_NAME, { trackUrl });
    const sendResult = await trySendBrandedCustomerEmail(env, {
      to: updated.customerEmail,
      toName: updated.customerName,
      subject: email.subject,
      body: email.text,
      htmlBody: email.html,
    });
    customerEmailSent = sendResult.sent;
    if (!sendResult.sent) {
      customerEmailError = sendResult.error || "Updated confirmation email failed";
      warnings.push(customerEmailError);
    }
  }

  const recentAudit = (updated.editHistory ?? []).slice(-(Object.keys(fields).length + 2));

  return jsonResponse(
    {
      ok: true,
      paymentReference: updated.paymentReference,
      checkoutId: updated.checkoutId,
      amountPaid: updated.amountPaidLabel,
      status: updated.status,
      booking: {
        paymentReference: updated.paymentReference,
        checkoutId: updated.checkoutId,
        createdAt: updated.createdAt,
        status: updated.status,
        amountPaid: updated.amountPaidLabel,
        customerName: updated.customerName,
        customerEmail: updated.customerEmail,
        mobileNumber: updated.mobileNumber,
        tripLabel: updated.tripLabel,
        pickupLabel: updated.pickupLabel,
        dropoffLabel: updated.dropoffLabel,
        tripDate: updated.tripDate,
        tripTime: updated.tripTime,
        returnJourney: updated.returnJourney,
        returnDate: updated.returnDate,
        returnTime: updated.returnTime,
        flightNumber: updated.flightNumber,
        returnFlightNumber: updated.returnFlightNumber,
        passengers: updated.passengers,
        suitcases: updated.suitcases,
        childSeats: updated.childSeats,
        childSeatNotes: updated.childSeatNotes,
        notes: updated.notes,
        vehicle: updated.vehicle,
        trackingToken: updated.trackingToken,
        calendarEventIds: updated.calendarEventIds,
        editHistory: updated.editHistory ?? [],
      },
      assignedDriver: PRIMARY_DRIVER_LABEL,
      fareMayNeedManualAdjustment,
      fareAdjustmentMessage: fareMayNeedManualAdjustment
        ? "Journey details changed — fare may require manual adjustment."
        : undefined,
      paymentPreserved: true,
      calendarUpdated: Boolean(calendarConfigured(env) && updated.calendarEventIds.length > 0),
      customerEmailSent,
      ...(customerEmailError ? { customerEmailError } : {}),
      auditEntries: recentAudit,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    200,
    origin,
  );
}

export async function handlePaidBookingSendUpdatedConfirmationRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to send updated confirmations." },
      401,
      origin,
    );
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: { paymentReference?: string };
  try {
    body = (await request.json()) as { paymentReference?: string };
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  if (!paymentReference) {
    return jsonResponse({ error: "Missing paymentReference" }, 400, origin);
  }

  const record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!record) {
    return jsonResponse({ error: `No paid booking found for ${paymentReference}` }, 404, origin);
  }
  if (record.status === "refunded") {
    return jsonResponse({ error: "Refunded bookings cannot send confirmations." }, 400, origin);
  }

  const bookingDetails = await loadBookingDetails(env, record);
  const receipt = recordToReceipt(record, bookingDetails);
  const trackUrl = await resolvePaidBookingTrackUrl(env.TRACKING_STORE, record);
  const email = buildUpdatedBookingConfirmationEmail(receipt, BUSINESS_NAME, { trackUrl });
  const sendResult = await trySendBrandedCustomerEmail(env, {
    to: record.customerEmail,
    toName: record.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (!sendResult.sent) {
    return jsonResponse(
      {
        ok: false,
        error: sendResult.error || "Updated confirmation email failed",
        paymentReference,
        customerEmail: record.customerEmail,
        customerEmailSent: false,
      },
      502,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      paymentReference,
      customerEmail: record.customerEmail,
      customerEmailSent: true,
      subject: email.subject,
    },
    200,
    origin,
  );
}
