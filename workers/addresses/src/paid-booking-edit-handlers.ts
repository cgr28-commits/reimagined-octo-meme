/**
 * Owner-only paid booking edit + automatic updated confirmation email.
 * Confirmation content always comes from the canonical PaidBookingRecord.
 * Material journey edits are re-priced server-side; owner may keep the agreed
 * fare (override recorded in amendment history). No automatic SumUp charge/refund.
 */

import {
  type PaidBookingDetails,
  type PaidBookingReceipt,
} from "../shared/booking-notifications";
import { paidBookingRecordToReceipt } from "../shared/paid-booking-canonical";
import {
  generateAmendmentId,
  MATERIAL_REPRICE_FIELDS,
  summarizeAmendmentChanges,
} from "../shared/booking-amendment";
import {
  PRIMARY_DRIVER_LABEL,
  type PaidBookingAmendmentEvent,
  type PaidBookingRecord,
  grossAmountCollectedOf,
  refundDueToAlignWithJourneyFare,
} from "../shared/paid-booking-record";
import { buildPickupDateTimeLocal, journeyStatusOf } from "../shared/tracking";
import { corsHeaders } from "../shared/google-places";
import {
  calculateAuthoritativeWebsiteQuote,
  type QuoteServiceAirportCode,
} from "../../../src/lib/quote-service";
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
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  reindexTrackingJobDate,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { type WorkerEmailEnv } from "./worker-email";
import {
  sendUpdatedConfirmationForPaymentReference,
  sendUpdatedConfirmationFromCanonicalRecord,
} from "./send-updated-confirmation";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
    GOOGLE_CALENDAR_ID?: string;
  };

const FARE_SENSITIVE_FIELDS = new Set<string>(MATERIAL_REPRICE_FIELDS);

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
  airportCode?: string;
  isFromAirport?: boolean;
  /** @deprecated Automatic send after save is default. Legacy clients may still set this. */
  sendUpdatedConfirmation?: boolean;
  keepAgreedFare?: boolean;
  authoritativeFare?: number;
  agreedFare?: number;
};

export function recordToReceipt(record: PaidBookingRecord): PaidBookingReceipt {
  return paidBookingRecordToReceipt(record);
}

export function recordToDetails(record: PaidBookingRecord): PaidBookingDetails {
  return paidBookingRecordToReceipt(record);
}

function snapshotJourney(record: PaidBookingRecord): Record<string, string | number | boolean | null | undefined> {
  return {
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    returnJourney: record.returnJourney,
    returnDate: record.returnDate,
    returnTime: record.returnTime,
    passengers: record.passengers,
    suitcases: record.suitcases,
    childSeats: record.childSeats,
    flightNumber: record.flightNumber,
    returnFlightNumber: record.returnFlightNumber,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    mobileNumber: record.mobileNumber,
    vehicle: record.vehicle,
    airportCode: record.airportCode,
    amount: record.amount,
  };
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
  if (body.airportCode !== undefined) {
    fields.airportCode = String(body.airportCode).trim().toUpperCase();
  }
  if (body.isFromAirport !== undefined) {
    fields.isFromAirport = Boolean(body.isFromAirport);
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
  if (existing.status === "refunded" || existing.status === "cancelled") {
    return jsonResponse({ error: "Refunded bookings cannot be edited." }, 409, origin);
  }

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
        customerEmailSent: false,
        automaticConfirmation: false,
      },
      200,
      origin,
    );
  }

  const beforeSnap = snapshotJourney(existing);
  const previousTripDate = existing.tripDate;
  const amendmentId = generateAmendmentId();
  const changedAt = new Date().toISOString();

  // Server calculates authoritative fare for material journey edits — never trust browser fare.
  const fareSensitive = Object.keys(fields).some((key) => FARE_SENSITIVE_FIELDS.has(key));
  let serverCalculatedFare: number | null = null;
  let serverFareMessage: string | undefined;
  if (fareSensitive) {
    const merged = { ...existing, ...fields } as PaidBookingRecord;
    const airportRaw = String(merged.airportCode ?? "").trim().toUpperCase();
    const airportCode =
      airportRaw === "BFS" || airportRaw === "BHD" || airportRaw === "DUB" || airportRaw === "LDY"
        ? (airportRaw as QuoteServiceAirportCode)
        : null;
    const quote = calculateAuthoritativeWebsiteQuote({
      airportCode: merged.isAirportTrip || airportCode ? airportCode : null,
      fromAirport: Boolean(merged.isFromAirport),
      pickupAddress: merged.pickupLabel,
      dropoffAddress: merged.dropoffLabel,
      returnJourney: Boolean(merged.returnJourney),
      outboundDate: merged.tripDate,
      outboundTime: merged.tripTime,
      returnDate: merged.returnDate,
      returnTime: merged.returnTime,
      passengers: merged.passengers ?? 1,
      suitcases: merged.suitcases ?? 0,
    });
    if (quote.ok) {
      serverCalculatedFare = quote.amount;
    } else {
      serverFareMessage = quote.message;
    }
  }

  const keepAgreed = Boolean(body.keepAgreedFare);
  const agreedFare =
    typeof body.agreedFare === "number" && Number.isFinite(body.agreedFare)
      ? body.agreedFare
      : existing.amount;
  const ownerOverride =
    keepAgreed && serverCalculatedFare != null
      ? {
          authoritativeFare: serverCalculatedFare,
          agreedFare,
          difference: Math.round((serverCalculatedFare - agreedFare) * 100) / 100,
        }
      : undefined;

  const amendmentEvent: PaidBookingAmendmentEvent = {
    amendmentId,
    changedAt,
    changedBy: "Owner",
    before: beforeSnap,
    after: {
      ...beforeSnap,
      ...Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [
          k,
          typeof v === "object" && v !== null
            ? JSON.stringify(v)
            : (v as string | number | boolean | null | undefined),
        ]),
      ),
    },
    previousFare: existing.amount,
    newFare: ownerOverride
      ? ownerOverride.agreedFare
      : serverCalculatedFare != null
        ? serverCalculatedFare
        : existing.amount,
    difference:
      ownerOverride?.difference ??
      (serverCalculatedFare != null
        ? Math.round((serverCalculatedFare - existing.amount) * 100) / 100
        : 0),
    ownerOverride,
    idempotencyKey: `amend:${paymentReference}:${amendmentId}`,
  };

  // Journey fare only — never rewrite amountPaidLabel (gross collected) here.
  // Outstanding refund/top-up settlement stays explicit via refundDueAmount.
  const collected = grossAmountCollectedOf(existing);
  let moneyPatch: PaidBookingUpdateFields = {};
  if (!keepAgreed && serverCalculatedFare != null) {
    const originalAmount = existing.originalAmount ?? collected;
    const nextDue = refundDueToAlignWithJourneyFare(
      {
        ...existing,
        amount: serverCalculatedFare,
        originalAmount,
      },
      serverCalculatedFare,
    );
    moneyPatch = {
      amount: serverCalculatedFare,
      originalAmount,
      ...(nextDue > 0.005
        ? {
            refundDueAmount: nextDue,
            refundDueReason: `Owner material amendment ${amendmentId}: journey fare £${existing.amount.toFixed(2)} → £${serverCalculatedFare.toFixed(2)} (collected £${collected.toFixed(2)})`,
            refundDueAt: changedAt,
          }
        : {
            refundDueAmount: 0,
            refundDueReason: "",
            refundDueAt: "",
          }),
    };
  }

  const updated = await updatePaidBookingFields(
    env.TRACKING_STORE,
    paymentReference,
    {
      ...fields,
      ...moneyPatch,
      amendmentHistory: [...(existing.amendmentHistory ?? []), amendmentEvent],
    },
    {
      appendAudit: true,
      changedBy: "Owner",
    },
  );

  if (!updated) {
    return jsonResponse({ error: "Could not update booking" }, 500, origin);
  }

  const warnings: string[] = [];
  const fareMayNeedManualAdjustment = fareSensitive && keepAgreed;
  if (serverFareMessage) {
    warnings.push(`Could not auto-reprice: ${serverFareMessage}`);
  }
  const fareAdjustmentMessage =
    fareSensitive && serverCalculatedFare != null
      ? keepAgreed
        ? `Server calculated £${serverCalculatedFare.toFixed(2)}; agreed fare kept at £${agreedFare.toFixed(2)}.`
        : `Server calculated fare £${serverCalculatedFare.toFixed(2)} applied (was £${existing.amount.toFixed(2)}). Original payment reference unchanged.`
      : fareSensitive && serverFareMessage
        ? serverFareMessage
        : undefined;

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
            `Updated via owner dashboard at ${changedAt}\n` +
            `Payment reference preserved: ${updated.paymentReference}\n` +
            `Pickup: ${updated.pickupLabel}\n` +
            `Drop-off: ${updated.dropoffLabel}\n` +
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

  const afterSnap = snapshotJourney(updated);
  const whatChanged = summarizeAmendmentChanges(beforeSnap, afterSnap);
  const appliedDue = Number(updated.refundDueAmount) || 0;
  const fareNote = ownerOverride
    ? `Agreed fare kept at £${ownerOverride.agreedFare.toFixed(2)} (calculated £${ownerOverride.authoritativeFare.toFixed(2)})`
    : serverCalculatedFare != null && serverCalculatedFare !== existing.amount
      ? appliedDue > 0.005
        ? `Updated journey price: £${serverCalculatedFare.toFixed(2)}\nRefund due: £${appliedDue.toFixed(2)}`
        : `Updated journey fare: £${serverCalculatedFare.toFixed(2)}`
      : "No change to your fare";

  const emailResult = await sendUpdatedConfirmationForPaymentReference({
    env: env as Env & { TRACKING_STORE: KVNamespace },
    paymentReference,
    whatChanged,
    fareNote,
    amendmentId,
    before: beforeSnap,
    after: afterSnap,
  });

  const customerEmailSent = Boolean(emailResult?.sent);
  let customerEmailError: string | undefined;
  if (!customerEmailSent) {
    customerEmailError = emailResult?.error || "Updated confirmation email failed";
    warnings.push(customerEmailError);
  }

  const recentAudit = (updated.editHistory ?? []).slice(-(Object.keys(fields).length + 2));
  const fresh = (await getPaidBookingRecord(env.TRACKING_STORE, paymentReference)) || updated;

  return jsonResponse(
    {
      ok: true,
      paymentReference: fresh.paymentReference,
      checkoutId: fresh.checkoutId,
      amountPaid: fresh.amountPaidLabel,
      status: fresh.status,
      booking: {
        paymentReference: fresh.paymentReference,
        checkoutId: fresh.checkoutId,
        createdAt: fresh.createdAt,
        status: fresh.status,
        amount: fresh.amount,
        amountPaidLabel: fresh.amountPaidLabel,
        customerName: fresh.customerName,
        customerEmail: fresh.customerEmail,
        mobileNumber: fresh.mobileNumber,
        tripLabel: fresh.tripLabel,
        pickupLabel: fresh.pickupLabel,
        dropoffLabel: fresh.dropoffLabel,
        tripDate: fresh.tripDate,
        tripTime: fresh.tripTime,
        returnJourney: fresh.returnJourney,
        returnDate: fresh.returnDate,
        returnTime: fresh.returnTime,
        passengers: fresh.passengers,
        suitcases: fresh.suitcases,
        flightNumber: fresh.flightNumber,
        returnFlightNumber: fresh.returnFlightNumber,
        vehicle: fresh.vehicle,
        trackingToken: fresh.trackingToken,
        calendarEventIds: fresh.calendarEventIds,
        editHistory: fresh.editHistory,
        amendmentHistory: fresh.amendmentHistory,
        lastUpdatedConfirmationSentAt: fresh.lastUpdatedConfirmationSentAt,
        lastUpdatedConfirmationError: fresh.lastUpdatedConfirmationError,
        refundDueAmount: fresh.refundDueAmount,
      },
      assignedDriver: PRIMARY_DRIVER_LABEL,
      fareMayNeedManualAdjustment,
      fareAdjustmentMessage,
      serverCalculatedFare,
      currentAgreedFare: existing.amount,
      keepAgreedFare: keepAgreed,
      paymentPreserved: true,
      changes: recentAudit,
      whatChanged,
      amendmentId,
      automaticConfirmation: true,
      customerEmailSent,
      customerEmailError,
      confirmationPickupLabel: emailResult?.receiptPickupLabel ?? fresh.pickupLabel,
      warnings,
    },
    200,
    origin,
  );
}

/** POST — resend updated confirmation from canonical record only (backup). */
export async function handlePaidBookingSendUpdatedConfirmationRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to resend confirmations." },
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
  if (record.status === "refunded" || record.status === "cancelled") {
    return jsonResponse(
      { error: "That booking was cancelled or refunded — confirmation not resent." },
      400,
      origin,
    );
  }

  const result = await sendUpdatedConfirmationFromCanonicalRecord({
    env,
    record,
    fareNote: "No change to your fare",
    persistStatus: true,
  });

  return jsonResponse(
    {
      ok: result.sent,
      paymentReference: record.paymentReference,
      customerEmail: record.customerEmail,
      customerEmailSent: result.sent,
      customerEmailError: result.error,
      subject: result.subject,
      confirmationPickupLabel: result.receiptPickupLabel,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      tripDate: record.tripDate,
      tripTime: record.tripTime,
      resendOnly: true,
    },
    result.sent ? 200 : 502,
    origin,
  );
}
