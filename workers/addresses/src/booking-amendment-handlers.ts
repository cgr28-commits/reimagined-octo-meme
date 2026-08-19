/**
 * Customer self-service booking amendments for paid bookings.
 * Server-side 24h gate (Europe/London). Fare-sensitive changes always reprice
 * via the authoritative website quote engine. Higher fare → SumUp top-up only
 * after payment; lower fare → contact required (no automatic refund).
 */

import {
  CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
  FREE_AMENDMENT_HINT,
  LOWER_FARE_CONTACT_BODY,
  LOWER_FARE_CONTACT_HEADLINE,
  WITHIN_24H_AMENDMENT_BODY,
  WITHIN_24H_AMENDMENT_HEADLINE,
  buildHigherFarePendingAmendment,
  describeFareDifference,
  evaluateCustomerAmendmentAccess,
  generateAmendmentId,
  isValidScheduleDate,
  isValidScheduleTime,
  materialFieldsChanged,
  normalizeScheduleDate,
  normalizeScheduleTime,
  validatePendingAmendmentForPayment,
  isPendingAmendmentExpired,
  type DateTimeAmendmentAuditEntry,
  type ProposedBookingAmendment,
} from "../shared/booking-amendment";
import { hoursUntilPickup, isWithin24HoursOfPickup } from "../shared/refund-ops";
import { corsHeaders } from "../shared/google-places";
import { INSTANT_QUOTE_MAX_PASSENGERS } from "../shared/passenger-limits";
import { buildManageBookingUrl } from "../shared/manage-booking-token";
import { matchServedAirportCode } from "../shared/served-airports";
import type { PaidBookingAmendmentEvent, PaidBookingRecord } from "../shared/paid-booking-record";
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
  ensureCustomerBookingReference,
  ensureManageBookingToken,
  getPaidBookingRecord,
  getPaidBookingRecordByManageToken,
  paidBookingStoreConfigured,
  resolvePaidBookingForCustomerLookup,
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
const FRIENDLY_UPDATE_ERROR =
  "We couldn’t update your booking. Your existing booking has not been changed. Please try again or contact us.";

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

function siteOriginFrom(request: Request, env: Env): string {
  return (
    request.headers.get("Origin")?.replace(/\/$/, "") ||
    env.SITE_ORIGIN?.replace(/\/$/, "") ||
    "https://www.myairporttaxini.co.uk"
  );
}

async function prepareManageRecord(
  store: KVNamespace,
  record: PaidBookingRecord,
): Promise<PaidBookingRecord> {
  let next = await ensureCustomerBookingReference(store, record);
  next = await ensureManageBookingToken(store, next);
  return next;
}

function publicAmendmentSummary(record: PaidBookingRecord, siteOrigin?: string) {
  const within24h = isWithin24HoursOfPickup(record.tripDate, record.tripTime);
  const used = Math.max(0, Math.floor(Number(record.dateTimeAmendmentCount) || 0));
  const pending = record.pendingAmendment;
  const manageUrl =
    record.manageBookingToken && siteOrigin
      ? buildManageBookingUrl(siteOrigin, record.manageBookingToken)
      : undefined;
  return {
    paymentReference: record.paymentReference,
    customerReference: record.customerReference || undefined,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    mobileNumber: record.mobileNumber || "",
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    passengers: record.passengers ?? 1,
    suitcases: record.suitcases ?? 0,
    childSeats: record.childSeats ?? 0,
    childSeatNotes: record.childSeatNotes || "",
    flightNumber: record.flightNumber || "",
    returnFlightNumber: record.returnFlightNumber || "",
    isAirportTrip: Boolean(record.isAirportTrip),
    airportCode: record.airportCode || "",
    isFromAirport: Boolean(record.isFromAirport),
    returnJourney: Boolean(record.returnJourney),
    maxOnlinePassengers: INSTANT_QUOTE_MAX_PASSENGERS,
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
            proposed: pending.proposed,
          }
        : null,
    selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
    lastUpdatedConfirmationSentAt: record.lastUpdatedConfirmationSentAt,
    lastUpdatedConfirmationError: record.lastUpdatedConfirmationError,
    manageBookingUrl: manageUrl,
    hasManageToken: Boolean(record.manageBookingToken),
  };
}

function parseProposedFromBody(
  body: Record<string, unknown>,
  record: PaidBookingRecord,
): { ok: true; proposed: ProposedBookingAmendment } | { ok: false; error: string } {
  const proposed: ProposedBookingAmendment = {};

  if (body.tripDate !== undefined) {
    const tripDate = normalizeScheduleDate(String(body.tripDate ?? ""));
    if (!isValidScheduleDate(tripDate)) {
      return { ok: false, error: "Please enter a valid pickup date." };
    }
    proposed.tripDate = tripDate;
  }
  if (body.tripTime !== undefined) {
    const tripTime = normalizeScheduleTime(String(body.tripTime ?? ""));
    if (!isValidScheduleTime(tripTime)) {
      return { ok: false, error: "Please enter a valid pickup time." };
    }
    proposed.tripTime = tripTime;
  }
  if (body.pickupLabel !== undefined) {
    const pickup = String(body.pickupLabel ?? "").trim();
    if (!pickup) return { ok: false, error: "Please select a pickup address from the suggestions." };
    proposed.pickupLabel = pickup;
  }
  if (body.dropoffLabel !== undefined) {
    const dropoff = String(body.dropoffLabel ?? "").trim();
    if (!dropoff) {
      return { ok: false, error: "Please select a destination from the suggestions." };
    }
    proposed.dropoffLabel = dropoff;
  }
  if (body.passengers !== undefined) {
    const passengers = Math.floor(Number(body.passengers));
    if (
      !Number.isFinite(passengers) ||
      passengers < 1 ||
      passengers > INSTANT_QUOTE_MAX_PASSENGERS
    ) {
      return {
        ok: false,
        error: `Online bookings support up to ${INSTANT_QUOTE_MAX_PASSENGERS} passengers. Please contact us for larger groups.`,
      };
    }
    proposed.passengers = passengers;
  }
  if (body.suitcases !== undefined) {
    const suitcases = Math.floor(Number(body.suitcases));
    if (!Number.isFinite(suitcases) || suitcases < 0 || suitcases > 8) {
      return { ok: false, error: "Please enter a valid number of suitcases." };
    }
    proposed.suitcases = suitcases;
  }
  if (body.childSeats !== undefined) {
    const childSeats = Math.floor(Number(body.childSeats));
    if (!Number.isFinite(childSeats) || childSeats < 0 || childSeats > 2) {
      return { ok: false, error: "Child seats must be 0, 1, or 2." };
    }
    proposed.childSeats = childSeats;
  }
  if (body.childSeatNotes !== undefined) {
    proposed.childSeatNotes = String(body.childSeatNotes ?? "").trim().slice(0, 200);
  }
  if (body.flightNumber !== undefined) {
    proposed.flightNumber = String(body.flightNumber ?? "").trim().toUpperCase().slice(0, 16);
  }
  if (body.mobileNumber !== undefined) {
    const mobile = String(body.mobileNumber ?? "").trim();
    if (mobile.length < 7) {
      return { ok: false, error: "Please enter a valid mobile number." };
    }
    proposed.mobileNumber = mobile.slice(0, 32);
  }

  // Default to current schedule when omitted so access evaluation still works.
  if (proposed.tripDate === undefined && proposed.tripTime === undefined) {
    // non-schedule-only proposals are fine
  } else {
    if (proposed.tripDate === undefined) proposed.tripDate = record.tripDate;
    if (proposed.tripTime === undefined) proposed.tripTime = record.tripTime;
  }

  return { ok: true, proposed };
}

function mergeProposedOntoRecord(
  record: PaidBookingRecord,
  proposed: ProposedBookingAmendment,
): {
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
} {
  return {
    tripDate: proposed.tripDate ?? record.tripDate,
    tripTime: proposed.tripTime ?? record.tripTime,
    pickupLabel: proposed.pickupLabel ?? record.pickupLabel,
    dropoffLabel: proposed.dropoffLabel ?? record.dropoffLabel,
    passengers: proposed.passengers ?? record.passengers ?? 1,
    suitcases: proposed.suitcases ?? record.suitcases ?? 0,
    childSeats: proposed.childSeats ?? record.childSeats ?? 0,
    childSeatNotes:
      proposed.childSeatNotes !== undefined
        ? String(proposed.childSeatNotes)
        : record.childSeatNotes || "",
    flightNumber:
      proposed.flightNumber !== undefined
        ? String(proposed.flightNumber)
        : record.flightNumber || "",
    mobileNumber:
      proposed.mobileNumber !== undefined
        ? String(proposed.mobileNumber)
        : record.mobileNumber || "",
  };
}

function buildChangeSummary(
  record: PaidBookingRecord,
  merged: ReturnType<typeof mergeProposedOntoRecord>,
): string[] {
  const changes: string[] = [];
  if (merged.pickupLabel !== record.pickupLabel) changes.push("Pickup address changed");
  if (merged.dropoffLabel !== record.dropoffLabel) changes.push("Destination changed");
  if (merged.tripDate !== record.tripDate) changes.push("Pickup date changed");
  if (merged.tripTime !== record.tripTime) changes.push("Pickup time changed");
  if (merged.passengers !== (record.passengers ?? 1)) changes.push("Passenger count changed");
  if (merged.suitcases !== (record.suitcases ?? 0)) changes.push("Luggage changed");
  if (merged.childSeats !== (record.childSeats ?? 0)) changes.push("Child seats changed");
  if (merged.flightNumber !== (record.flightNumber || "")) changes.push("Flight number changed");
  if (merged.mobileNumber !== (record.mobileNumber || "")) changes.push("Mobile number changed");
  return changes;
}

function fieldDiffs(
  record: PaidBookingRecord,
  merged: ReturnType<typeof mergeProposedOntoRecord>,
): Array<{ field: string; label: string; oldValue: string; newValue: string }> {
  const rows: Array<{ field: string; label: string; oldValue: string; newValue: string }> = [];
  const push = (field: string, label: string, oldValue: string, newValue: string) => {
    if (oldValue !== newValue) rows.push({ field, label, oldValue, newValue });
  };
  push("pickupLabel", "Pickup", record.pickupLabel, merged.pickupLabel);
  push("dropoffLabel", "Destination", record.dropoffLabel, merged.dropoffLabel);
  push("tripDate", "Date", record.tripDate, merged.tripDate);
  push("tripTime", "Time", record.tripTime, merged.tripTime);
  push("passengers", "Passengers", String(record.passengers ?? 1), String(merged.passengers));
  push("suitcases", "Suitcases", String(record.suitcases ?? 0), String(merged.suitcases));
  push("childSeats", "Child seats", String(record.childSeats ?? 0), String(merged.childSeats));
  push("flightNumber", "Flight number", record.flightNumber || "—", merged.flightNumber || "—");
  push("mobileNumber", "Mobile", record.mobileNumber || "—", merged.mobileNumber || "—");
  return rows;
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

export function isPaidBookingAmendAbandonPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/amend-abandon" ||
    pathname === "/api/paid-bookings/amend-abandon"
  );
}

async function clearExpiredPendingIfNeeded(
  store: KVNamespace,
  record: PaidBookingRecord,
): Promise<PaidBookingRecord> {
  const pending = record.pendingAmendment;
  if (!pending || pending.status !== "awaiting_payment") return record;
  if (!isPendingAmendmentExpired(pending)) return record;
  const updated = await updatePaidBookingFields(
    store,
    record.paymentReference,
    {
      pendingAmendment: {
        ...pending,
        status: "expired",
        paymentUrl: undefined,
        checkoutId: undefined,
      },
    },
    { appendAudit: false },
  );
  if (!updated) return record;
  const cleared = await updatePaidBookingFields(
    store,
    record.paymentReference,
    { pendingAmendment: null },
    { appendAudit: false },
  );
  return cleared || { ...updated, pendingAmendment: null };
}

/** POST — lookup booking for manage-booking UI (token OR ref + email). */
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

  const manageToken = String(body.token ?? body.manageToken ?? "").trim();
  const siteOrigin = siteOriginFrom(request, env);

  if (manageToken) {
    let record = await getPaidBookingRecordByManageToken(env.TRACKING_STORE, manageToken);
    if (!record) {
      return jsonResponse(
        { error: "This manage booking link is invalid or has expired." },
        404,
        origin,
      );
    }
    record = await prepareManageRecord(env.TRACKING_STORE, record);
    record = await clearExpiredPendingIfNeeded(env.TRACKING_STORE, record);
    return jsonResponse(
      { ok: true, booking: publicAmendmentSummary(record, siteOrigin), loadedVia: "token" },
      200,
      origin,
    );
  }

  const paymentReference = String(
    body.paymentReference ?? body.customerReference ?? body.bookingReference ?? "",
  ).trim();
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  if (!paymentReference || !customerEmail) {
    return jsonResponse(
      { error: "Booking reference and email are required." },
      400,
      origin,
    );
  }

  let record = await resolvePaidBookingForCustomerLookup(env.TRACKING_STORE, paymentReference);
  if (!record || !emailsMatch(record.customerEmail, customerEmail)) {
    return jsonResponse(
      { error: "We could not find a booking with that reference and email." },
      404,
      origin,
    );
  }

  record = await prepareManageRecord(env.TRACKING_STORE, record);
  record = await clearExpiredPendingIfNeeded(env.TRACKING_STORE, record);

  return jsonResponse(
    { ok: true, booking: publicAmendmentSummary(record, siteOrigin), loadedVia: "reference" },
    200,
    origin,
  );
}

/**
 * POST — abandon a stuck awaiting_payment pending amendment without consuming
 * free quota or mutating confirmed journey details.
 */
export async function handleCustomerAmendAbandon(
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
  const manageToken = String(body.token ?? "").trim();

  let record: PaidBookingRecord | null = null;
  if (manageToken) {
    record = await getPaidBookingRecordByManageToken(env.TRACKING_STORE, manageToken);
  } else if (paymentReference && customerEmail) {
    record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
    if (record && !emailsMatch(record.customerEmail, customerEmail)) {
      record = null;
    }
  }

  if (!record) {
    return jsonResponse(
      { error: "We could not find a booking with that reference and email." },
      404,
      origin,
    );
  }

  const pending = record.pendingAmendment;
  if (!pending || pending.status !== "awaiting_payment") {
    const prepared = await prepareManageRecord(env.TRACKING_STORE, record);
    return jsonResponse(
      {
        ok: true,
        abandoned: false,
        message: "There is no pending amendment payment to cancel.",
        booking: publicAmendmentSummary(prepared, siteOriginFrom(request, env)),
      },
      200,
      origin,
    );
  }

  const updated = await updatePaidBookingFields(
    env.TRACKING_STORE,
    record.paymentReference,
    {
      pendingAmendment: {
        ...pending,
        status: "abandoned",
        paymentUrl: undefined,
        checkoutId: undefined,
      },
    },
    { appendAudit: true, changedBy: "Customer" },
  );

  if (!updated) {
    return jsonResponse({ error: FRIENDLY_UPDATE_ERROR }, 500, origin);
  }

  const prepared = await prepareManageRecord(env.TRACKING_STORE, updated);
  return jsonResponse(
    {
      ok: true,
      abandoned: true,
      message:
        "The incomplete payment request was cancelled. Your original booking is unchanged and your free online change remains available if eligible.",
      booking: publicAmendmentSummary(prepared, siteOriginFrom(request, env)),
    },
    200,
    origin,
  );
}

/** POST — customer amendment preview or commit (server-enforced 24h + free quota). */
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
  const manageToken = String(body.token ?? "").trim();
  const previewOnly = body.preview === true || body.mode === "preview";
  const siteOrigin = siteOriginFrom(request, env);

  let record: PaidBookingRecord | null = null;
  if (manageToken) {
    record = await getPaidBookingRecordByManageToken(env.TRACKING_STORE, manageToken);
  } else if (paymentReference && customerEmail) {
    record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
    if (record && !emailsMatch(record.customerEmail, customerEmail)) {
      record = null;
    }
  }

  if (!record) {
    return jsonResponse(
      { error: "We could not find a booking with that reference and email." },
      404,
      origin,
    );
  }

  record = await prepareManageRecord(env.TRACKING_STORE, record);

  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token = record.trackingToken?.trim();
    let job = token ? await getTrackingJob(env.TRACKING_STORE, token) : null;
    if (!job) {
      job = await findTrackingJobByPaymentReference(env.TRACKING_STORE, record.paymentReference);
    }
    if (job && journeyStatusOf(job) === "completed") {
      return jsonResponse(
        { error: "This journey has already been completed and cannot be changed online." },
        409,
        origin,
      );
    }
  }

  const parsed = parseProposedFromBody(body, record);
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, 400, origin);
  }
  const proposed = parsed.proposed;
  const merged = mergeProposedOntoRecord(record, proposed);

  const decision = evaluateCustomerAmendmentAccess({
    booking: {
      tripDate: record.tripDate,
      tripTime: record.tripTime,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      passengers: record.passengers,
      suitcases: record.suitcases,
      childSeats: record.childSeats,
      childSeatNotes: record.childSeatNotes,
      returnJourney: record.returnJourney,
      status: record.status,
      operationalStatus: record.operationalStatus,
      paymentStatus: record.paymentStatus,
      dateTimeAmendmentCount: record.dateTimeAmendmentCount,
      amountRefunded: record.amountRefunded,
      amount: record.amount,
      pendingAmendment: record.pendingAmendment,
      mobileNumber: record.mobileNumber,
      flightNumber: record.flightNumber,
    },
    proposed: {
      ...proposed,
      mobileNumber: proposed.mobileNumber,
      flightNumber: proposed.flightNumber,
      childSeatNotes: proposed.childSeatNotes,
    },
  });

  if (!decision.ok) {
    const status =
      decision.reason === "within_24_hours"
        ? 403
        : decision.reason === "free_quota_exhausted" ||
            decision.reason === "awaiting_extra_payment"
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
        booking: publicAmendmentSummary(record, siteOrigin),
      },
      status,
      origin,
    );
  }

  const materialChanged = materialFieldsChanged(
    {
      tripDate: record.tripDate,
      tripTime: record.tripTime,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      passengers: record.passengers,
      suitcases: record.suitcases,
      childSeats: record.childSeats,
      returnJourney: record.returnJourney,
      airportCode: record.airportCode,
      isFromAirport: record.isFromAirport,
    },
    proposed,
  );
  const burnsFreeQuota = materialChanged.length > 0;

  const pickupAirport = matchServedAirportCode(merged.pickupLabel);
  const dropoffAirport = matchServedAirportCode(merged.dropoffLabel);
  const storedRaw = String(record.airportCode ?? "").trim().toUpperCase();
  const storedCode =
    storedRaw === "BFS" || storedRaw === "BHD" || storedRaw === "DUB" || storedRaw === "LDY"
      ? (storedRaw as QuoteServiceAirportCode)
      : null;

  let resolvedAirportCode: QuoteServiceAirportCode | null = null;
  let resolvedFromAirport = Boolean(record.isFromAirport);
  let resolvedIsAirportTrip = Boolean(record.isAirportTrip);

  if (pickupAirport && !dropoffAirport) {
    resolvedAirportCode = pickupAirport as QuoteServiceAirportCode;
    resolvedFromAirport = true;
    resolvedIsAirportTrip = true;
  } else if (dropoffAirport && !pickupAirport) {
    resolvedAirportCode = dropoffAirport as QuoteServiceAirportCode;
    resolvedFromAirport = false;
    resolvedIsAirportTrip = true;
  } else if (pickupAirport && dropoffAirport) {
    resolvedAirportCode = dropoffAirport as QuoteServiceAirportCode;
    resolvedFromAirport = true;
    resolvedIsAirportTrip = true;
  } else if (resolvedIsAirportTrip || storedCode) {
    resolvedAirportCode = storedCode;
  }

  // Always reprice server-side (weekday/weekend/bank holiday may differ).
  // Client amount / authoritativeFare / newFare are ignored if present.
  let previousFare = Number(record.amount) || 0;
  let newFare = previousFare;
  let fareDiff = describeFareDifference(previousFare, newFare);

  if (burnsFreeQuota) {
    const quote = calculateAuthoritativeWebsiteQuote({
      airportCode:
        resolvedIsAirportTrip || resolvedAirportCode ? resolvedAirportCode : null,
      fromAirport: resolvedFromAirport,
      pickupAddress: merged.pickupLabel,
      dropoffAddress: merged.dropoffLabel,
      returnJourney: Boolean(record.returnJourney),
      outboundDate: merged.tripDate,
      outboundTime: merged.tripTime,
      returnDate: record.returnDate,
      returnTime: record.returnTime,
      passengers: merged.passengers,
      suitcases: merged.suitcases,
    });

    if (!quote.ok) {
      return jsonResponse(
        {
          error:
            quote.message ||
            "We could not recalculate this journey online. Please contact My Airport Taxi NI.",
          reason: "capacity_not_online",
          contactRequired: true,
          booking: publicAmendmentSummary(record, siteOrigin),
        },
        422,
        origin,
      );
    }

    newFare = quote.amount;
    fareDiff = describeFareDifference(previousFare, newFare);
  }

  const changes = buildChangeSummary(record, merged);
  const diffs = fieldDiffs(record, merged);
  const review = {
    changes,
    diffs,
    fare: {
      ...fareDiff,
      previousFareLabel: `£${fareDiff.previousFare.toFixed(2)}`,
      newFareLabel: `£${fareDiff.newFare.toFixed(2)}`,
      differenceLabel: `£${Math.abs(fareDiff.difference).toFixed(2)}`,
      amountPaidLabel: record.amountPaidLabel,
    },
    burnsFreeQuota,
    proposed: merged,
  };

  if (previewOnly) {
    if (fareDiff.kind === "refund_due") {
      return jsonResponse(
        {
          ok: true,
          preview: true,
          reason: "lower_fare_contact_required",
          contactRequired: true,
          headline: LOWER_FARE_CONTACT_HEADLINE,
          body: LOWER_FARE_CONTACT_BODY,
          review,
          booking: publicAmendmentSummary(record, siteOrigin),
        },
        200,
        origin,
      );
    }
    return jsonResponse(
      {
        ok: true,
        preview: true,
        review,
        booking: publicAmendmentSummary(record, siteOrigin),
        selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
      },
      200,
      origin,
    );
  }

  // Lower fare: do not auto-refund or rewrite collected amount — contact us.
  if (fareDiff.kind === "refund_due") {
    return jsonResponse(
      {
        error: LOWER_FARE_CONTACT_BODY,
        reason: "lower_fare_contact_required",
        contactRequired: true,
        headline: LOWER_FARE_CONTACT_HEADLINE,
        body: LOWER_FARE_CONTACT_BODY,
        review,
        booking: publicAmendmentSummary(record, siteOrigin),
      },
      422,
      origin,
    );
  }

  const amendmentId = generateAmendmentId();
  const changedAt = new Date().toISOString();
  const previousTripDate = record.tripDate;
  const previousTripTime = record.tripTime;

  // Higher fare: pending only — commit after SumUp top-up succeeds.
  if (fareDiff.kind === "additional_payment") {
    if (record.isAmendmentTestFixture) {
      return jsonResponse(
        {
          error:
            "This amendment test fixture cannot create a live SumUp top-up. Reset the fixture for same-fare tests, or use MAT-3817 for payment-difference tests.",
          reason: "amendment_test_fixture_no_sumup",
          contactRequired: true,
          review,
          booking: publicAmendmentSummary(record, siteOrigin),
        },
        422,
        origin,
      );
    }
    const pending = buildHigherFarePendingAmendment({
      paymentReference: record.paymentReference,
      amendmentId,
      previousFare,
      newFare,
      proposed: {
        tripDate: merged.tripDate,
        tripTime: merged.tripTime,
        pickupLabel: merged.pickupLabel,
        dropoffLabel: merged.dropoffLabel,
        passengers: merged.passengers,
        suitcases: merged.suitcases,
        childSeats: merged.childSeats,
        childSeatNotes: merged.childSeatNotes,
        flightNumber: merged.flightNumber,
        mobileNumber: merged.mobileNumber,
        airportCode: resolvedAirportCode,
        isFromAirport: resolvedFromAirport,
        isAirportTrip: resolvedIsAirportTrip,
      },
      createdBy: "Customer",
    });
    await updatePaidBookingFields(
      env.TRACKING_STORE,
      record.paymentReference,
      { pendingAmendment: pending },
      { appendAudit: false },
    );

    const originUrl = new URL(request.url);
    const redirectUrl = `${siteOrigin}/manage-booking/?amendment=return&ref=${encodeURIComponent(record.paymentReference)}`;
    const returnUrl = `${originUrl.origin}/payments/webhook`;

    const fresh = (await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference)) || record;
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
          review,
          pendingAmendment: pending,
          booking: publicAmendmentSummary(fresh, siteOrigin),
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
        review,
        pendingAmendment: topUp.pending,
        paymentUrl: topUp.paymentUrl,
        checkoutId: topUp.checkoutId,
        checkoutReference: topUp.checkoutReference,
        amountDue: topUp.amount,
        amountDueLabel: `£${topUp.amount.toFixed(2)}`,
        booking: publicAmendmentSummary(
          (await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference)) || fresh,
          siteOrigin,
        ),
        note: "Your existing booking will remain unchanged until the additional payment is completed.",
        payCtaLabel: `Pay £${topUp.amount.toFixed(2)} & Confirm Change`,
        selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
      },
      402,
      origin,
    );
  }

  // Same fare (or non-material): commit immediately. Burn free quota only for material changes.
  const historyEntry: DateTimeAmendmentAuditEntry = {
    changedAt,
    previousTripDate,
    previousTripTime,
    newTripDate: merged.tripDate,
    newTripTime: merged.tripTime,
    changedBy: "Customer",
    farePreserved: fareDiff.kind === "none",
    previousFare,
    newFare,
    notes: burnsFreeQuota
      ? "Customer self-service amendment — fare unchanged after authoritative reprice"
      : "Customer non-fare detail update (flight/mobile/etc.)",
  };

  const amendmentEvent: PaidBookingAmendmentEvent = {
    amendmentId,
    changedAt,
    changedBy: "Customer",
    before: {
      tripDate: previousTripDate,
      tripTime: previousTripTime,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      passengers: record.passengers,
      suitcases: record.suitcases,
      childSeats: record.childSeats,
      flightNumber: record.flightNumber,
      mobileNumber: record.mobileNumber,
      amount: previousFare,
    },
    after: {
      tripDate: merged.tripDate,
      tripTime: merged.tripTime,
      pickupLabel: merged.pickupLabel,
      dropoffLabel: merged.dropoffLabel,
      passengers: merged.passengers,
      suitcases: merged.suitcases,
      childSeats: merged.childSeats,
      flightNumber: merged.flightNumber,
      mobileNumber: merged.mobileNumber,
      amount: newFare,
    },
    previousFare,
    newFare,
    difference: 0,
    idempotencyKey: `amend:${record.paymentReference}:${amendmentId}`,
  };

  const nextCount = burnsFreeQuota
    ? Math.max(0, Number(record.dateTimeAmendmentCount) || 0) + 1
    : Math.max(0, Number(record.dateTimeAmendmentCount) || 0);

  const updated = await updatePaidBookingFields(
    env.TRACKING_STORE,
    record.paymentReference,
    {
      tripDate: merged.tripDate,
      tripTime: merged.tripTime,
      pickupLabel: merged.pickupLabel,
      dropoffLabel: merged.dropoffLabel,
      passengers: merged.passengers,
      suitcases: merged.suitcases,
      childSeats: merged.childSeats,
      childSeatNotes: merged.childSeatNotes,
      flightNumber: merged.flightNumber,
      mobileNumber: merged.mobileNumber,
      airportCode: resolvedAirportCode || undefined,
      isFromAirport: resolvedFromAirport,
      isAirportTrip: resolvedIsAirportTrip,
      originalTripDate: record.originalTripDate || previousTripDate,
      originalTripTime: record.originalTripTime || previousTripTime,
      dateTimeAmendmentCount: nextCount,
      dateTimeAmendmentHistory: burnsFreeQuota
        ? [...(record.dateTimeAmendmentHistory ?? []), historyEntry]
        : record.dateTimeAmendmentHistory ?? [],
      amendmentHistory: [...(record.amendmentHistory ?? []), amendmentEvent],
      pendingAmendment: null,
      amount: newFare,
    },
    { appendAudit: true, changedBy: "Customer" },
  );

  if (!updated) {
    return jsonResponse({ error: FRIENDLY_UPDATE_ERROR }, 500, origin);
  }

  const warnings: string[] = [];

  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token = updated.trackingToken?.trim();
    let job = token ? await getTrackingJob(env.TRACKING_STORE, token) : null;
    if (!job) {
      job = await findTrackingJobByPaymentReference(
        env.TRACKING_STORE,
        record.paymentReference,
      );
    }
    if (job) {
      const prevDate = job.tripDate;
      job.tripDate = updated.tripDate;
      job.tripTime = updated.tripTime;
      job.pickupLabel = updated.pickupLabel;
      job.dropoffLabel = updated.dropoffLabel;
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

  const emailResult = await sendUpdatedConfirmationForPaymentReference({
    env: env as Env & { TRACKING_STORE: KVNamespace },
    paymentReference: record.paymentReference,
    whatChanged: changes.length ? changes : ["Booking details updated"],
    fareNote: "No additional payment required",
    amendmentId,
  });

  if (!emailResult?.sent) {
    warnings.push(emailResult?.error || "Confirmation email failed");
  }

  const fresh =
    (await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference)) || updated;

  return jsonResponse(
    {
      ok: true,
      farePreserved: fareDiff.kind === "none",
      fare: fareDiff,
      amendmentId,
      review,
      customerEmailSent: Boolean(emailResult?.sent),
      customerEmailError: emailResult?.sent ? undefined : emailResult?.error,
      confirmationPickupLabel: fresh.pickupLabel,
      booking: publicAmendmentSummary(fresh, siteOrigin),
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
  const manageToken = String(body.token ?? "").trim();
  const amendmentId = String(body.amendmentId ?? "").trim() || undefined;
  const siteOrigin = siteOriginFrom(request, env);

  let record: PaidBookingRecord | null = null;
  if (manageToken) {
    record = await getPaidBookingRecordByManageToken(env.TRACKING_STORE, manageToken);
  } else if (paymentReference && customerEmail) {
    record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
    if (record && !emailsMatch(record.customerEmail, customerEmail)) {
      record = null;
    }
  }

  if (!record) {
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
        record.paymentReference,
        { pendingAmendment: { ...record.pendingAmendment, status: "expired" } },
        { appendAudit: false },
      );
    }
    return jsonResponse(
      {
        error: validation.message,
        reason: validation.reason,
        contactRequired: validation.reason === "within_24_hours",
        booking: publicAmendmentSummary(record, siteOrigin),
      },
      validation.reason === "within_24_hours" ? 403 : 409,
      origin,
    );
  }

  const originUrl = new URL(request.url);
  const redirectUrl = `${siteOrigin}/manage-booking/?amendment=return&ref=${encodeURIComponent(record.paymentReference)}`;
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
      {
        error: topUp.message,
        reason: topUp.reason,
        booking: publicAmendmentSummary(record, siteOrigin),
      },
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
        (await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference)) || record,
        siteOrigin,
      ),
      selfServiceFields: CUSTOMER_SELF_SERVICE_AMENDMENT_FIELDS,
    },
    200,
    origin,
  );
}

/**
 * POST — after SumUp return: resolve booking from amendment-topup checkout id.
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

  let record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!record) {
    return jsonResponse({ error: "Booking not found for this amendment payment." }, 404, origin);
  }

  record = await prepareManageRecord(env.TRACKING_STORE, record);

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
      booking: publicAmendmentSummary(record, siteOriginFrom(request, env)),
    },
    200,
    origin,
  );
}
