/**
 * Journey lifecycle + short-lived GPS session tokens + owner evidence pack (JSON).
 * Reuses TRACKING_STORE jobs — no separate booking database.
 */

import {
  applyJourneyAction,
  allowedJourneyActions,
  buildPublicTrackUrl,
  customerJourneyLabel,
  formatLondonDateTime,
  journeyStatusOf,
  type JourneyAction,
} from "../shared/tracking";
import { corsHeaders } from "../shared/google-places";
import {
  assertDriverCanOperateJob,
} from "./driver-assignment-utils";
import {
  driverAuthorized,
  ownerAuthorized,
  resolveDriverSession,
} from "./driver-auth";
import {
  createTrackingSession,
  createTrackingJobFromBooking,
  getDriverLocationHistory,
  getTrackingJob,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { getPaidBookingRecord, paidBookingStoreConfigured, savePaidBookingRecord } from "./paid-booking-store";
import type { PaidBookingDetails } from "../shared/booking-notifications";

type Env = {
  TRACKING_STORE?: KVNamespace;
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_NAME?: string;
  DRIVER_ROSTER?: string;
  /** Optional override for GPS audit retention (seconds). */
  TRACKING_GPS_HISTORY_TTL_SECONDS?: string;
};

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

const JOURNEY_ACTIONS = new Set<JourneyAction>([
  "start_tracking",
  "arrived_pickup",
  "start_journey",
  "arrived_destination",
  "complete_journey",
  "stop_tracking",
]);

function parseJourneyAction(value: unknown): JourneyAction | null {
  const action = String(value ?? "").trim() as JourneyAction;
  return JOURNEY_ACTIONS.has(action) ? action : null;
}

export async function handleJourneyTransitionRequest(
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const action = parseJourneyAction(body.action);
  if (!token || !action) {
    return jsonResponse({ error: "Missing token or valid action" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  const session = resolveDriverSession(request, env);
  const operateError = assertDriverCanOperateJob(record, session);
  if (operateError) {
    return jsonResponse({ error: operateError }, 409, origin);
  }

  const applied = applyJourneyAction(record, action);
  if (!applied.ok) {
    return jsonResponse({ error: applied.error }, 409, origin);
  }

  const next = applied.job;
  if (session.authorized && session.role === "driver" && session.driverName && next.sharingActive) {
    next.activeDriverName = session.driverName;
  } else if (session.authorized && session.role === "owner" && next.sharingActive) {
    next.activeDriverName = next.activeDriverName ?? "Owner";
  }

  await saveTrackingJob(env.TRACKING_STORE, next);

  let trackingSession: { sessionToken: string; expiresAt: string } | undefined;
  if (next.sharingActive) {
    const created = await createTrackingSession(env.TRACKING_STORE, {
      jobToken: next.token,
      createdByRole: session.authorized && session.role === "owner" ? "owner" : "driver",
      driverName:
        session.authorized && session.role === "driver"
          ? session.driverName
          : next.activeDriverName,
    });
    trackingSession = {
      sessionToken: created.sessionToken,
      expiresAt: created.expiresAt,
    };
  }

  return jsonResponse(
    {
      ok: true,
      token: next.token,
      journeyStatus: journeyStatusOf(next),
      journeyStatusLabel: customerJourneyLabel(next),
      allowedActions: allowedJourneyActions(journeyStatusOf(next)),
      sharingActive: next.sharingActive,
      trackUrl: buildPublicTrackUrl(next.token),
      trackingStartedAt: next.trackingStartedAt,
      arrivedPickupAt: next.arrivedPickupAt,
      journeyStartedAt: next.journeyStartedAt,
      arrivedDestinationAt: next.arrivedDestinationAt,
      journeyCompletedAt: next.journeyCompletedAt,
      trackingStoppedAt: next.trackingStoppedAt,
      ...(trackingSession ? { trackingSession } : {}),
    },
    200,
    origin,
  );
}

export async function handleJourneySessionRequest(
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
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

  const session = resolveDriverSession(request, env);
  const operateError = assertDriverCanOperateJob(record, session);
  if (operateError) {
    return jsonResponse({ error: operateError }, 409, origin);
  }

  if (!record.sharingActive) {
    return jsonResponse({ error: "Start tracking before requesting a GPS session" }, 409, origin);
  }

  const created = await createTrackingSession(env.TRACKING_STORE, {
    jobToken: record.token,
    createdByRole: session.authorized && session.role === "owner" ? "owner" : "driver",
    driverName:
      session.authorized && session.role === "driver"
        ? session.driverName
        : record.activeDriverName,
  });

  return jsonResponse(
    {
      ok: true,
      token: record.token,
      sessionToken: created.sessionToken,
      expiresAt: created.expiresAt,
    },
    200,
    origin,
  );
}

export async function handleJourneyEvidenceRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  const points = await getDriverLocationHistory(env.TRACKING_STORE, token);
  let paid = null;
  if (record.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
    paid = await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference);
  }

  const started = record.trackingStartedAt ?? record.journeyStartedAt;
  const ended = record.journeyCompletedAt ?? record.arrivedDestinationAt ?? record.trackingStoppedAt;
  let durationMinutes: number | undefined;
  if (started && ended) {
    const ms = new Date(ended).getTime() - new Date(started).getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      durationMinutes = Math.round(ms / 60000);
    }
  }

  return jsonResponse(
    {
      ok: true,
      evidence: {
        businessName: "My Airport Taxi NI",
        disclaimer:
          "Automatically generated journey record from the booking system. Intended as supporting operational evidence; it does not guarantee the outcome of any payment dispute.",
        bookingReference: record.paymentReference ?? record.token,
        paymentReference: record.paymentReference,
        amountPaid: paid?.amountPaidLabel,
        paymentStatus: paid?.status ?? "confirmed",
        customerName: record.customerName,
        customerMobile: record.customerMobile,
        customerEmail: record.customerEmail,
        pickupLabel: record.pickupLabel,
        dropoffLabel: record.dropoffLabel,
        tripDate: record.tripDate,
        tripTime: record.tripTime,
        pickupDisplay: formatLondonDateTime(record.pickupAt),
        flightNumber: record.flightNumber,
        journeyStatus: journeyStatusOf(record),
        journeyStatusLabel: customerJourneyLabel(record),
        trackingStartedAt: record.trackingStartedAt,
        arrivedPickupAt: record.arrivedPickupAt,
        journeyStartedAt: record.journeyStartedAt,
        arrivedDestinationAt: record.arrivedDestinationAt,
        journeyCompletedAt: record.journeyCompletedAt,
        trackingStoppedAt: record.trackingStoppedAt,
        durationMinutes,
        pointCount: points.length,
        recordedFrom: record.driverLocationRecordedFrom ?? points[0]?.recordedAt,
        recordedTo: record.driverLocationRecordedTo ?? points.at(-1)?.recordedAt,
        trackUrl: buildPublicTrackUrl(record.token),
        points,
      },
    },
    200,
    origin,
  );
}

/**
 * Owner-only: create tracking job(s) for an existing paid booking that has none.
 * Safe for recovering older paid bookings / test fixtures — no new SumUp charge.
 */
export async function handleEnsureTrackingRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Paid booking store is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  if (!paymentReference) {
    return jsonResponse({ error: "Missing paymentReference" }, 400, origin);
  }

  const paid = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!paid) {
    return jsonResponse({ error: `No paid booking for ${paymentReference}` }, 404, origin);
  }
  if (paid.status === "refunded") {
    return jsonResponse({ error: "Cannot create tracking for a refunded booking" }, 400, origin);
  }

  if (paid.trackingToken?.trim()) {
    const existing = await getTrackingJob(env.TRACKING_STORE, paid.trackingToken);
    if (existing) {
      return jsonResponse(
        {
          ok: true,
          alreadyExisted: true,
          token: existing.token,
          trackUrl: buildPublicTrackUrl(existing.token),
        },
        200,
        origin,
      );
    }
  }

  const booking: PaidBookingDetails = {
    customerName: paid.customerName,
    customerEmail: paid.customerEmail,
    mobileNumber: paid.mobileNumber,
    tripLabel: paid.tripLabel,
    pickupLabel: paid.pickupLabel,
    dropoffLabel: paid.dropoffLabel,
    returnJourney: paid.returnJourney,
    tripDate: paid.tripDate,
    tripTime: paid.tripTime,
    returnDate: paid.returnDate ?? "",
    returnTime: paid.returnTime ?? "",
    flightNumber: paid.flightNumber ?? "",
    returnFlightNumber: paid.returnFlightNumber ?? "",
    passengers: paid.passengers ?? 1,
    suitcases: paid.suitcases ?? 0,
    vehicle: paid.vehicle ?? "Saloon",
    isAirportTrip: paid.isAirportTrip ?? false,
    airportCode: paid.airportCode,
    isFromAirport: paid.isFromAirport,
  };

  const record = await createTrackingJobFromBooking(
    env.TRACKING_STORE,
    booking,
    paymentReference,
  );
  if (!record) {
    return jsonResponse({ error: "Could not create tracking job for this booking" }, 502, origin);
  }

  await savePaidBookingRecord(env.TRACKING_STORE, {
    ...paid,
    trackingToken: record.token,
  });

  return jsonResponse(
    {
      ok: true,
      alreadyExisted: false,
      token: record.token,
      trackUrl: buildPublicTrackUrl(record.token),
    },
    200,
    origin,
  );
}

export function isJourneyTransitionPath(pathname: string): boolean {
  return pathname === "/driver/journey" || pathname === "/api/driver/journey";
}

export function isJourneySessionPath(pathname: string): boolean {
  return (
    pathname === "/driver/journey/session" || pathname === "/api/driver/journey/session"
  );
}

export function isJourneyEvidencePath(pathname: string): boolean {
  return (
    pathname === "/driver/journey/evidence" || pathname === "/api/driver/journey/evidence"
  );
}

export function isEnsureTrackingPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/ensure-tracking" ||
    pathname === "/api/paid-bookings/ensure-tracking"
  );
}
