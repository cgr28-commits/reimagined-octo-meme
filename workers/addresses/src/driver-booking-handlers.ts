import { buildPickupDateTimeLocal } from "../shared/tracking";
import type { TrackingJobRecord } from "../shared/tracking";
import { isAirportPickupJob } from "../shared/tracking";
import { lookupFlight, type VerifiedFlight } from "../shared/flight-lookup";
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
import { getBookingJob } from "./booking-job-store";
import {
  getTrackingJob,
  reindexTrackingJobDate,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { publicTrackPayload } from "./tracking-handlers";
import { corsHeaders } from "../shared/google-places";
import { assertDriverCanViewJob } from "./driver-assignment-utils";
import { driverAuthorized, resolveDriverSession, sanitizeDriverJobForRole, type DashboardRole } from "./driver-auth";

type Env = {
  TRACKING_STORE?: KVNamespace;
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_NAME?: string;
  DRIVER_ROSTER?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
  AERODATABOX_RAPIDAPI_KEY?: string;
};

const AIRPORT_NAMES: Record<string, string> = {
  BFS: "Belfast International",
  BHD: "George Best Belfast City",
  DUB: "Dublin Airport",
  LDY: "City of Derry",
};

function calendarConfigured(env: Env): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

async function resolveDriverFlight(
  record: TrackingJobRecord,
  env: Env,
): Promise<VerifiedFlight | null> {
  if (
    !record.isAirportTrip ||
    !record.isFromAirport ||
    !record.flightNumber?.trim() ||
    !record.airportCode?.trim()
  ) {
    return null;
  }

  const apiKey = env.AERODATABOX_RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  try {
    const result = await lookupFlight(apiKey, {
      flightNumber: record.flightNumber,
      tripDate: record.tripDate,
      airportCode: record.airportCode,
      airportName: AIRPORT_NAMES[record.airportCode] ?? record.airportCode,
      direction: "from-airport",
    });

    return result.ok ? result.flight : null;
  } catch (error) {
    console.error("Driver flight lookup failed", error);
    return null;
  }
}

export async function enrichDriverJob(
  job: TrackingJobRecord,
  env: Env,
  origin: string | null,
  role: DashboardRole = "owner",
) {
  const flight = await resolveDriverFlight(job, env);
  const paidRecord =
    job.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)
      ? await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference)
      : null;

  const bookingJob =
    job.paymentReference && env.TRACKING_STORE
      ? (await getBookingJob(env.TRACKING_STORE, job.paymentReference)) ??
        (await getBookingJob(env.TRACKING_STORE, job.token))
      : null;

  // Prefer paid booking combined status; refunded_active stays active operationally.
  const bookingStatus =
    paidRecord?.status ??
    (job.refundedAt ? "refunded" : "confirmed");

  return sanitizeDriverJobForRole(
    {
      ...publicTrackPayload(job, origin, { includeCustomerLocation: true }),
      token: job.token,
      customerMobile: job.customerMobile,
      paymentReference: job.paymentReference,
      amountPaidLabel: paidRecord?.amountPaidLabel,
      bookingStatus,
      refundAmountLabel: paidRecord?.refundAmountLabel ?? job.refundAmountLabel,
      activeDriverName: job.activeDriverName,
      assignedDriverName: job.assignedDriverName ?? bookingJob?.driverFirstName,
      assignmentStatus: job.assignmentStatus ?? bookingJob?.driverAssignmentStatus ?? "unassigned",
      assignedAt: job.assignedAt ?? bookingJob?.assignedAt,
      acceptedAt: job.acceptedAt ?? bookingJob?.driverAcceptedAt,
      declinedAt: job.declinedAt ?? bookingJob?.driverDeclinedAt,
      assignedDriverMobile: bookingJob?.driverMobile,
      assignedDriverCarMake: bookingJob?.driverCarMake,
      assignedDriverCarModel: bookingJob?.driverCarModel,
      assignedDriverCarColour: bookingJob?.driverCarColour,
      assignedDriverReg: bookingJob?.driverReg,
      driverPayAmount: bookingJob?.driverPayAmount,
      driverLocationPointCount: job.driverLocationPointCount,
      driverLocationRecordedFrom: job.driverLocationRecordedFrom,
      driverLocationRecordedTo: job.driverLocationRecordedTo,
      isAirportPickup: isAirportPickupJob(job),
      flightNumber: job.flightNumber ?? null,
      airportCode: job.airportCode ?? null,
      flight,
    },
    role,
  );
}

export type DriverBookingUpdateBody = {
  token?: string;
  tripDate?: string;
  tripTime?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  customerMobile?: string;
  flightNumber?: string;
};

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export async function handleDriverUpdateBookingRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  if (!driverAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const session = resolveDriverSession(request, env);
  const role: DashboardRole = session.authorized ? session.role : "driver";

  let body: DriverBookingUpdateBody;
  try {
    body = (await request.json()) as DriverBookingUpdateBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  if (record.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const paidRecord = await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference);
    if (paidRecord?.status === "refunded" || paidRecord?.status === "cancelled") {
      return jsonResponse({ error: "This booking has been refunded" }, 409, origin);
    }
  }

  if (role === "driver") {
    const viewError = assertDriverCanViewJob(record, session);
    if (viewError) {
      return jsonResponse({ error: viewError }, 403, origin);
    }
  }

  const previousDate = record.tripDate;
  const previousTime = record.tripTime;
  const previousPickup = record.pickupLabel;
  const previousDropoff = record.dropoffLabel;
  const previousMobile = record.customerMobile;
  const previousFlight = record.flightNumber ?? "";

  if (body.tripDate !== undefined) {
    const tripDate = String(body.tripDate).trim();
    if (!isValidDate(tripDate)) {
      return jsonResponse({ error: "Invalid trip date" }, 400, origin);
    }
    record.tripDate = tripDate;
  }

  if (body.tripTime !== undefined) {
    const tripTime = String(body.tripTime).trim();
    if (!isValidTime(tripTime)) {
      return jsonResponse({ error: "Invalid trip time" }, 400, origin);
    }
    record.tripTime = tripTime;
  }

  if (body.pickupLabel !== undefined) {
    record.pickupLabel = String(body.pickupLabel).trim();
  }

  if (body.dropoffLabel !== undefined) {
    record.dropoffLabel = String(body.dropoffLabel).trim();
  }

  if (body.customerMobile !== undefined) {
    if (role === "owner") {
      record.customerMobile = String(body.customerMobile).trim();
    }
  }

  if (body.flightNumber !== undefined) {
    const flightNumber = String(body.flightNumber).trim();
    record.flightNumber = flightNumber ? flightNumber.toUpperCase() : undefined;
  }

  const pickupAt = buildPickupDateTimeLocal(record.tripDate, record.tripTime);
  if (!pickupAt) {
    return jsonResponse({ error: "Invalid trip date or time" }, 400, origin);
  }

  const changed =
    record.tripDate !== previousDate ||
    record.tripTime !== previousTime ||
    record.pickupLabel !== previousPickup ||
    record.dropoffLabel !== previousDropoff ||
    record.customerMobile !== previousMobile ||
    (record.flightNumber ?? "") !== previousFlight;

  if (!changed) {
    return jsonResponse({ ok: true, job: await enrichDriverJob(record, env, origin, role) }, 200, origin);
  }

  record.pickupAt = pickupAt;
  await saveTrackingJob(env.TRACKING_STORE, record);

  if (record.tripDate !== previousDate) {
    await reindexTrackingJobDate(env.TRACKING_STORE, token, previousDate, record.tripDate);
  }

  const warnings: string[] = [];

  if (record.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const updated = await updatePaidBookingFields(
      env.TRACKING_STORE,
      record.paymentReference,
      {
        tripDate: record.tripDate,
        tripTime: record.tripTime,
        pickupLabel: record.pickupLabel,
        dropoffLabel: record.dropoffLabel,
        mobileNumber: record.customerMobile,
      },
      { appendAudit: false },
    );

    if (!updated) {
      warnings.push("Paid booking record could not be updated");
    } else if (calendarConfigured(env) && updated.calendarEventIds.length > 0) {
      try {
        const serviceAccount = parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!);
        const accessToken = await getGoogleAccessToken(serviceAccount);
        const startDateTime = `${record.tripDate}T${record.tripTime}`;
        const updateNote =
          `Updated via driver dashboard at ${new Date().toISOString()}\n` +
          (record.tripDate !== previousDate || record.tripTime !== previousTime
            ? `Was: ${previousDate} ${previousTime}\nNow: ${record.tripDate} ${record.tripTime}\n`
            : "") +
          (record.pickupLabel !== previousPickup
            ? `Pickup was: ${previousPickup}\nPickup now: ${record.pickupLabel}\n`
            : "") +
          (record.dropoffLabel !== previousDropoff
            ? `Drop-off was: ${previousDropoff}\nDrop-off now: ${record.dropoffLabel}\n`
            : "");

        const result = await rescheduleCalendarEvents(
          accessToken,
          env.GOOGLE_CALENDAR_ID!.trim(),
          [updated.calendarEventIds[0]!],
          {
            startDateTime,
            endDateTime: transferEventEndDateTime(startDateTime),
            location: record.pickupLabel,
            updateNote,
          },
        );

        if (result.errors.length > 0) {
          warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
        }
      } catch (error) {
        warnings.push(
          error instanceof Error ? error.message : "Calendar update failed",
        );
      }
    }
  }

  const job = await enrichDriverJob(record, env, origin, role);

  return jsonResponse(
    {
      ok: true,
      job,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    200,
    origin,
  );
}
