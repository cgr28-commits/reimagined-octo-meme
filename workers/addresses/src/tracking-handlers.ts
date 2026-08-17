import {
  buildPublicTrackUrl,
  customerJourneyLabel,
  formatLondonDateTime,
  getTrackingWindow,
  isAirportPickupJob,
  isLocationFresh,
  journeyStatusOf,
  allowedJourneyActions,
  type TrackingJobRecord,
} from "../shared/tracking";
import { lookupFlight, type VerifiedFlight } from "../shared/flight-lookup";
import {
  createTrackingJobFromBooking,
  appendDriverLocationPoint,
  getDriverLocationHistory,
  getTrackingJob,
  isTrackingJobCancelled,
  listTrackingJobsForDate,
  listTrackingJobsForRecentDays,
  listUpcomingTrackingJobs,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { corsHeaders } from "../shared/google-places";
import {
  bookingJobStoreConfigured,
  getBookingJob,
} from "./booking-job-store";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import {
  filterJobsForSession,
  assertDriverCanOperateJob,
} from "./driver-assignment-utils";
import { jobAssignmentStatus } from "../shared/tracking";
import {
  driverAuthorized,
  driverAuthStatus,
  isDriverAuthConfigured,
  listConfiguredDrivers,
  ownerAuthorized,
  resolveDriverSession,
  sanitizeDriverJobForRole,
  type DashboardRole,
} from "./driver-auth";
import { type WorkerEmailEnv } from "./worker-email";
import { resolveCustomerVisibleVehicle } from "./driver-vehicle-store";
import { toCustomerVehicleDetails } from "../shared/driver-vehicle";
import { getTrackingSession, gpsHistoryTtlSeconds } from "./tracking-store";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_NAME?: string;
  DRIVER_ROSTER?: string;
  AERODATABOX_RAPIDAPI_KEY?: string;
  TRACKING_GPS_HISTORY_TTL_SECONDS?: string;
};

/** Soft in-memory rate limit for GPS posts (per isolate). */
const LOCATION_RATE_LIMIT = new Map<string, number>();

const AIRPORT_NAMES: Record<string, string> = {
  BFS: "Belfast International",
  BHD: "George Best Belfast City",
  DUB: "Dublin Airport",
  LDY: "City of Derry",
};

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

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

async function isJobCancelled(record: TrackingJobRecord, env: Env): Promise<boolean> {
  if (isTrackingJobCancelled(record)) {
    return true;
  }

  if (record.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const paidRecord = await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference);
    if (paidRecord?.status === "refunded") {
      return true;
    }
  }

  return false;
}

async function cancelledJobResponse(
  record: TrackingJobRecord,
  env: Env,
  origin: string | null,
): Promise<Response | null> {
  if (!(await isJobCancelled(record, env))) {
    return null;
  }

  return jsonResponse(
    {
      error: "This booking has been cancelled",
      cancelled: true,
    },
    410,
    origin,
  );
}

function liveDriverLocation(record: TrackingJobRecord, windowOpen: boolean) {
  const journeyDone =
    journeyStatusOf(record) === "completed" || journeyStatusOf(record) === "stopped";
  if (
    !windowOpen ||
    journeyDone ||
    !record.sharingActive ||
    typeof record.driverLat !== "number" ||
    typeof record.driverLng !== "number" ||
    !isLocationFresh(record.driverUpdatedAt)
  ) {
    return null;
  }

  return {
    lat: record.driverLat,
    lng: record.driverLng,
    updatedAt: record.driverUpdatedAt!,
  };
}

function liveCustomerLocation(record: TrackingJobRecord, windowOpen: boolean) {
  if (
    !windowOpen ||
    !record.customerSharingActive ||
    typeof record.customerLat !== "number" ||
    typeof record.customerLng !== "number" ||
    !isLocationFresh(record.customerUpdatedAt)
  ) {
    return null;
  }

  return {
    lat: record.customerLat,
    lng: record.customerLng,
    updatedAt: record.customerUpdatedAt!,
  };
}

export function publicTrackPayload(
  record: TrackingJobRecord,
  origin: string | null,
  options: { includeCustomerLocation?: boolean } = {},
) {
  const window = getTrackingWindow(record.pickupAt);
  const driver = liveDriverLocation(record, window.open);
  const customer = options.includeCustomerLocation
    ? liveCustomerLocation(record, window.open)
    : null;

  return {
    ok: true,
    customerName: record.customerName,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    pickupAt: record.pickupAt,
    pickupDisplay: formatLondonDateTime(record.pickupAt),
    trackingWindow: {
      ...window,
      opensAtDisplay: formatLondonDateTime(window.opensAt),
      closesAtDisplay: formatLondonDateTime(window.closesAt),
    },
    sharingActive: record.sharingActive,
    customerSharingActive: Boolean(record.customerSharingActive),
    journeyStatus: journeyStatusOf(record),
    journeyStatusLabel: customerJourneyLabel(record),
    /** Invoice / payment reference customers already receive — not a sequential internal id. */
    bookingReference: record.paymentReference ?? undefined,
    driver,
    customer,
    trackUrl: buildPublicTrackUrl(record.token),
  };
}

export async function createTrackingJobForPaidBooking(
  env: Env,
  booking: PaidBookingDetails,
  paymentReference?: string,
): Promise<{ created: boolean; trackUrl?: string; token?: string }> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return { created: false };
  }

  try {
    const record = await createTrackingJobFromBooking(
      env.TRACKING_STORE,
      booking,
      paymentReference,
    );
    if (!record) {
      return { created: false };
    }

    return {
      created: true,
      token: record.token,
      trackUrl: buildPublicTrackUrl(record.token),
    };
  } catch (error) {
    console.error("Tracking job creation failed", error);
    return { created: false };
  }
}

export async function handlePublicTrackRequest(
  token: string,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return jsonResponse({ error: "Missing tracking id" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, trimmed);
  if (!record) {
    return jsonResponse({ error: "Tracking link not found" }, 404, origin);
  }

  const cancelled = await cancelledJobResponse(record, env, origin);
  if (cancelled) {
    return cancelled;
  }

  return jsonResponse(
    await buildPublicTrackResponse(record, env, origin),
    200,
    origin,
  );
}

export async function buildPublicTrackResponse(
  record: TrackingJobRecord,
  env: Env,
  origin: string | null,
): Promise<ReturnType<typeof publicTrackPayload> & { vehicle?: ReturnType<typeof toCustomerVehicleDetails> }> {
  const payload = publicTrackPayload(record, origin);
  const window = getTrackingWindow(record.pickupAt);

  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return payload;
  }

  const profile = await resolveCustomerVisibleVehicle(env.TRACKING_STORE, {
    trackingWindowOpen: window.open,
    sharingActive: record.sharingActive,
    driverName: record.activeDriverName ?? record.assignedDriverName,
  });

  if (!profile) {
    return payload;
  }

  return {
    ...payload,
    vehicle: toCustomerVehicleDetails(profile),
  };
}

async function backfillReturnTrackingLegs(
  store: KVNamespace,
  seedJobs: TrackingJobRecord[],
): Promise<void> {
  if (!bookingJobStoreConfigured(store)) {
    return;
  }

  const seen = new Set<string>();
  for (const job of seedJobs) {
    const paymentRef = job.paymentReference?.trim();
    if (!paymentRef || seen.has(paymentRef)) {
      continue;
    }
    seen.add(paymentRef);

    const booking = await getBookingJob(store, paymentRef);
    if (!booking || booking.status !== "paid") {
      continue;
    }
    if (!booking.returnJourney || !booking.returnDate?.trim() || !booking.returnTime?.trim()) {
      continue;
    }

    try {
      await createTrackingJobFromBooking(
        store,
        {
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          mobileNumber: booking.customerMobile,
          tripLabel: booking.tripLabel,
          pickupLabel: booking.pickupLabel,
          dropoffLabel: booking.dropoffLabel,
          returnJourney: true,
          tripDate: booking.tripDate,
          tripTime: booking.tripTime,
          returnDate: booking.returnDate,
          returnTime: booking.returnTime,
          flightNumber: booking.flightNumber ?? "",
          returnFlightNumber: booking.returnFlightNumber,
          passengers: booking.passengers,
          suitcases: booking.suitcases,
          vehicle: booking.vehicle,
          isAirportTrip: booking.isAirportTrip,
          airportCode: booking.airportCode,
          isFromAirport: booking.isFromAirport,
        },
        paymentRef,
      );
    } catch (error) {
      console.error("Return tracking leg backfill failed", paymentRef, error);
    }
  }
}

export async function handleDriverJobsRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  if (!driverAuthorized(request, env)) {
    return jsonResponse(
      {
        error:
          "Unauthorized — check your access key. Sign out and enter the key from Cloudflare (OWNER_ACCESS_KEY or DRIVER_ACCESS_KEY).",
      },
      401,
      origin,
    );
  }

  const session = resolveDriverSession(request, env);
  const role: DashboardRole = session.authorized ? session.role : "driver";

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope")?.trim().toLowerCase() ?? "date";
  const daysAhead = Math.min(
    90,
    Math.max(1, Number.parseInt(url.searchParams.get("days") ?? "60", 10) || 60),
  );
  const tripDate =
    url.searchParams.get("date")?.trim() ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  // Owner dashboard: create missing return-leg jobs from paid booking records
  // so Pick date / Upcoming show the return on its own day (e.g. 19 Aug).
  if (role === "owner") {
    const seed = [
      ...(await listUpcomingTrackingJobs(env.TRACKING_STORE, daysAhead)),
      ...(await listTrackingJobsForRecentDays(env.TRACKING_STORE, 45)),
    ];
    await backfillReturnTrackingLegs(env.TRACKING_STORE, seed);
  }

  let jobs: TrackingJobRecord[];
  let responseDate = tripDate;

  if (scope === "pending") {
    jobs = await listUpcomingTrackingJobs(env.TRACKING_STORE, daysAhead);
    jobs = jobs.filter((job) => jobAssignmentStatus(job) === "pending");
    responseDate = "pending";
  } else if (scope === "upcoming") {
    jobs = await listUpcomingTrackingJobs(env.TRACKING_STORE, daysAhead);
    responseDate = "upcoming";
  } else {
    jobs = await listTrackingJobsForDate(env.TRACKING_STORE, tripDate);
  }

  jobs = filterJobsForSession(jobs, session);

  const enrichedJobs = await Promise.all(
    jobs.map(async (job) => {
      const flight = await resolveDriverFlight(job, env);
      let amountPaidLabel: string | undefined;
      let bookingStatus: "confirmed" | "refunded" = "confirmed";
      let paidRecord = null;

      if (job.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
        paidRecord = await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference);
        if (paidRecord) {
          amountPaidLabel = paidRecord.amountPaidLabel;
          bookingStatus = paidRecord.status;
        }
      }

      if (bookingStatus !== "refunded" && job.refundedAt) {
        bookingStatus = "refunded";
      }

      const refundAmountLabel = paidRecord?.refundAmountLabel ?? job.refundAmountLabel;

      return sanitizeDriverJobForRole(
        {
          ...publicTrackPayload(job, origin, { includeCustomerLocation: true }),
          token: job.token,
          customerMobile: job.customerMobile,
          paymentReference: job.paymentReference,
          amountPaidLabel,
          bookingStatus,
          refundAmountLabel,
          activeDriverName: job.activeDriverName,
          assignedDriverName: job.assignedDriverName,
          assignmentStatus: jobAssignmentStatus(job),
          assignedAt: job.assignedAt,
          acceptedAt: job.acceptedAt,
          declinedAt: job.declinedAt,
          driverLocationPointCount: job.driverLocationPointCount,
          driverLocationRecordedFrom: job.driverLocationRecordedFrom,
          driverLocationRecordedTo: job.driverLocationRecordedTo,
          journeyStatus: journeyStatusOf(job),
          journeyStatusLabel: customerJourneyLabel(job),
          allowedJourneyActions: allowedJourneyActions(journeyStatusOf(job)),
          trackingStartedAt: job.trackingStartedAt,
          arrivedPickupAt: job.arrivedPickupAt,
          journeyStartedAt: job.journeyStartedAt,
          arrivedDestinationAt: job.arrivedDestinationAt,
          journeyCompletedAt: job.journeyCompletedAt,
          isAirportPickup: isAirportPickupJob(job),
          flightNumber: job.flightNumber ?? null,
          airportCode: job.airportCode ?? null,
          journeyLeg: job.journeyLeg ?? null,
          flight,
        },
        role,
      );
    }),
  );

  return jsonResponse(
    {
      ok: true,
      scope,
      date: responseDate,
      role,
      ...(session.authorized && session.role === "driver" ? { driverName: session.driverName } : {}),
      jobs: enrichedJobs,
    },
    200,
    origin,
  );
}

export async function handleDriverStatusRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const authConfigured = isDriverAuthConfigured(env);
  const session = resolveDriverSession(request, env);
  const authorized = session.authorized;
  const keys = driverAuthStatus(env);

  return jsonResponse(
    {
      ok: authorized,
      authConfigured,
      ...keys,
      ...(authorized
        ? {
            role: session.role,
            ...(session.role === "driver"
              ? { driverName: session.driverName }
              : { availableDrivers: listConfiguredDrivers(env) }),
          }
        : {}),
      worker: "reimagined-octo-meme",
      ...(authorized
        ? {}
        : {
            error: authConfigured
              ? keys.hasDriverKey && keys.hasOwnerKey
                ? "Access key did not match. Use OWNER_ACCESS_KEY (admin) or DRIVER_ACCESS_KEY (driver) from reimagined-octo-meme worker secrets."
                : keys.hasOwnerKey
                  ? "Access key did not match. Use the exact OWNER_ACCESS_KEY secret value from reimagined-octo-meme."
                  : "Access key did not match. Use the exact DRIVER_ACCESS_KEY secret value from reimagined-octo-meme."
              : "Driver access is not configured on reimagined-octo-meme. Add DRIVER_ACCESS_KEY and/or OWNER_ACCESS_KEY under that worker's encrypted secrets (not my-airport-taxi-ni).",
          }),
    },
    authorized ? 200 : authConfigured ? 401 : 503,
    origin,
  );
}

export async function handleDriverSharingRequest(
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
  const active = Boolean(body.active);

  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  const cancelled = await cancelledJobResponse(record, env, origin);
  if (cancelled) {
    return cancelled;
  }

  const session = resolveDriverSession(request, env);
  const operateError = assertDriverCanOperateJob(record, session);
  if (operateError && Boolean(active)) {
    return jsonResponse({ error: operateError }, 409, origin);
  }

  record.sharingActive = active;
  if (active) {
    if (session.authorized && session.role === "driver" && session.driverName) {
      record.activeDriverName = session.driverName;
    }
    if (!record.journeyStatus || record.journeyStatus === "idle" || record.journeyStatus === "stopped") {
      record.journeyStatus = "tracking";
      record.trackingStartedAt = record.trackingStartedAt ?? new Date().toISOString();
      delete record.trackingStoppedAt;
    }
  } else {
    delete record.driverLat;
    delete record.driverLng;
    delete record.driverUpdatedAt;
    delete record.activeDriverName;
    if (record.journeyStatus !== "completed") {
      record.journeyStatus = "stopped";
      record.trackingStoppedAt = new Date().toISOString();
    }
  }

  await saveTrackingJob(env.TRACKING_STORE, record);

  const trackUrl = buildPublicTrackUrl(record.token);

  return jsonResponse(
    {
      ok: true,
      token,
      sharingActive: record.sharingActive,
      trackUrl,
      sharingReminderSent: Boolean(record.sharingReminderSentAt),
    },
    200,
    origin,
  );
}

export async function handleDriverLocationRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const sessionHeader =
    request.headers.get("X-Tracking-Session")?.trim() ||
    String(body.sessionToken ?? "").trim();

  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: "Missing token or coordinates" }, 400, origin);
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return jsonResponse({ error: "Invalid coordinates" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  const cancelled = await cancelledJobResponse(record, env, origin);
  if (cancelled) {
    return cancelled;
  }

  let driverName = record.activeDriverName;
  if (sessionHeader) {
    const trackingSession = await getTrackingSession(env.TRACKING_STORE, sessionHeader);
    if (!trackingSession || trackingSession.jobToken !== token) {
      return jsonResponse({ error: "Invalid or expired tracking session" }, 401, origin);
    }
    driverName = trackingSession.driverName ?? driverName;
  } else {
    if (!driverAuthorized(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401, origin);
    }
    const session = resolveDriverSession(request, env);
    const operateError = assertDriverCanOperateJob(record, session);
    if (operateError) {
      return jsonResponse({ error: operateError }, 409, origin);
    }
    driverName =
      session.authorized && session.role === "driver"
        ? session.driverName
        : record.activeDriverName;
  }

  if (!record.sharingActive) {
    return jsonResponse({ error: "Sharing is not active for this job" }, 409, origin);
  }

  // Soft rate limit: accept at most one GPS post per job every 4 seconds.
  const rateKey = `loc:${token}`;
  const nowMs = Date.now();
  const lastPost = LOCATION_RATE_LIMIT.get(rateKey) ?? 0;
  if (nowMs - lastPost < 4_000) {
    return jsonResponse({ ok: true, throttled: true, pointCount: record.driverLocationPointCount ?? 0 }, 200, origin);
  }
  LOCATION_RATE_LIMIT.set(rateKey, nowMs);
  if (LOCATION_RATE_LIMIT.size > 5_000) {
    LOCATION_RATE_LIMIT.clear();
  }

  const recordedAt = new Date().toISOString();

  const appendResult = await appendDriverLocationPoint(env.TRACKING_STORE, token, {
    lat,
    lng,
    recordedAt,
    ...(driverName ? { driverName } : {}),
    ...(Number.isFinite(Number(body.accuracy)) ? { accuracyMeters: Number(body.accuracy) } : {}),
    ...(Number.isFinite(Number(body.speed)) ? { speedMps: Number(body.speed) } : {}),
    ...(Number.isFinite(Number(body.heading)) ? { headingDegrees: Number(body.heading) } : {}),
  }, {
    historyTtlSeconds: gpsHistoryTtlSeconds(env),
  });

  record.driverLat = lat;
  record.driverLng = lng;
  record.driverUpdatedAt = recordedAt;
  record.driverLocationPointCount = appendResult.pointCount;
  if (!record.driverLocationRecordedFrom) {
    record.driverLocationRecordedFrom = recordedAt;
  }
  record.driverLocationRecordedTo = recordedAt;
  await saveTrackingJob(env.TRACKING_STORE, record);

  return jsonResponse(
    { ok: true, pointCount: appendResult.pointCount, stored: appendResult.stored },
    200,
    origin,
  );
}

export async function handleDriverLocationHistoryRequest(
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

  return jsonResponse(
    {
      ok: true,
      token,
      count: points.length,
      recordedFrom: record.driverLocationRecordedFrom ?? points[0]?.recordedAt,
      recordedTo: record.driverLocationRecordedTo ?? points.at(-1)?.recordedAt,
      points,
    },
    200,
    origin,
  );
}

const RESERVED_TRACK_PATHS = new Set(["sharing", "location"]);

export function parseTrackSubRoute(pathname: string): "sharing" | "location" | null {
  if (pathname === "/track/sharing" || pathname === "/api/track/sharing") {
    return "sharing";
  }

  if (pathname === "/track/location" || pathname === "/api/track/location") {
    return "location";
  }

  return null;
}

export function parseTrackTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:api\/)?track\/([^/]+)\/?$/);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (!token || RESERVED_TRACK_PATHS.has(token)) {
    return null;
  }

  return token;
}

export async function handleCustomerSharingRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const active = Boolean(body.active);

  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Tracking link not found" }, 404, origin);
  }

  const cancelled = await cancelledJobResponse(record, env, origin);
  if (cancelled) {
    return cancelled;
  }

  const window = getTrackingWindow(record.pickupAt);
  if (!window.open) {
    return jsonResponse({ error: "Tracking window is not open" }, 403, origin);
  }

  record.customerSharingActive = active;
  if (!active) {
    delete record.customerLat;
    delete record.customerLng;
    delete record.customerUpdatedAt;
  }

  await saveTrackingJob(env.TRACKING_STORE, record);

  return jsonResponse(
    {
      ok: true,
      customerSharingActive: record.customerSharingActive,
    },
    200,
    origin,
  );
}

export async function handleCustomerLocationRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: "Missing token or coordinates" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Tracking link not found" }, 404, origin);
  }

  const cancelled = await cancelledJobResponse(record, env, origin);
  if (cancelled) {
    return cancelled;
  }

  const window = getTrackingWindow(record.pickupAt);
  if (!window.open) {
    return jsonResponse({ error: "Tracking window is not open" }, 403, origin);
  }

  if (!record.customerSharingActive) {
    return jsonResponse({ error: "Customer sharing is not active" }, 409, origin);
  }

  record.customerLat = lat;
  record.customerLng = lng;
  record.customerUpdatedAt = new Date().toISOString();
  await saveTrackingJob(env.TRACKING_STORE, record);

  return jsonResponse({ ok: true }, 200, origin);
}
