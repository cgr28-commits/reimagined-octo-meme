import {
  buildPublicTrackUrl,
  formatLondonDateTime,
  getTrackingWindow,
  isLocationFresh,
  type TrackingJobRecord,
} from "../shared/tracking";
import { lookupFlight, type VerifiedFlight } from "../shared/flight-lookup";
import { buildTrackingReminderEmail } from "../shared/booking-notifications";
import {
  createTrackingJobFromBooking,
  appendDriverLocationPoint,
  getDriverLocationHistory,
  getTrackingJob,
  isTrackingJobCancelled,
  listTrackingJobsForDate,
  listUpcomingTrackingJobs,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { corsHeaders } from "../shared/google-places";
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
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_NAME?: string;
  DRIVER_ROSTER?: string;
  AERODATABOX_RAPIDAPI_KEY?: string;
};

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
  if (
    !windowOpen ||
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

  return jsonResponse(publicTrackPayload(record, origin), 200, origin);
}

async function sendSharingReminderEmail(
  env: Env,
  record: TrackingJobRecord,
  trackUrl: string,
): Promise<boolean> {
  const customerEmail = record.customerEmail?.trim() ?? "";
  if (!customerEmail) {
    return false;
  }

  const reminder = buildTrackingReminderEmail(
    {
      customerName: record.customerName,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      tripDate: record.tripDate,
      tripTime: record.tripTime,
    },
    trackUrl,
  );

  const result = await trySendBrandedCustomerEmail(env, {
    to: customerEmail,
    toName: record.customerName,
    subject: reminder.subject,
    body: reminder.text,
    htmlBody: reminder.html,
  });

  if (!result.sent) {
    console.error("Sharing reminder email failed", result.error);
  }

  return result.sent;
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

  let jobs: TrackingJobRecord[];
  let responseDate = tripDate;

  if (scope === "upcoming") {
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
          isAirportPickup: Boolean(job.isAirportTrip && job.isFromAirport),
          flightNumber: job.flightNumber ?? null,
          airportCode: job.airportCode ?? null,
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

  const wasSharing = record.sharingActive;
  record.sharingActive = active;
  if (active) {
    if (session.authorized && session.role === "driver" && session.driverName) {
      record.activeDriverName = session.driverName;
    }
  } else {
    delete record.driverLat;
    delete record.driverLng;
    delete record.driverUpdatedAt;
    delete record.activeDriverName;
  }

  await saveTrackingJob(env.TRACKING_STORE, record);

  const trackUrl = buildPublicTrackUrl(record.token);

  if (
    active &&
    !wasSharing &&
    !record.sharingReminderSentAt &&
    record.customerEmail?.trim()
  ) {
    const sent = await sendSharingReminderEmail(env, record, trackUrl);
    if (sent) {
      record.sharingReminderSentAt = new Date().toISOString();
      await saveTrackingJob(env.TRACKING_STORE, record);
    }
  }

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
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: "Missing token or coordinates" }, 400, origin);
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
  if (operateError) {
    return jsonResponse({ error: operateError }, 409, origin);
  }

  if (!record.sharingActive) {
    return jsonResponse({ error: "Sharing is not active for this job" }, 409, origin);
  }

  const recordedAt = new Date().toISOString();
  const driverName =
    session.authorized && session.role === "driver"
      ? session.driverName
      : record.activeDriverName;

  const pointCount = await appendDriverLocationPoint(env.TRACKING_STORE, token, {
    lat,
    lng,
    recordedAt,
    ...(driverName ? { driverName } : {}),
  });

  record.driverLat = lat;
  record.driverLng = lng;
  record.driverUpdatedAt = recordedAt;
  record.driverLocationPointCount = pointCount;
  if (!record.driverLocationRecordedFrom) {
    record.driverLocationRecordedFrom = recordedAt;
  }
  record.driverLocationRecordedTo = recordedAt;
  await saveTrackingJob(env.TRACKING_STORE, record);

  return jsonResponse({ ok: true, pointCount }, 200, origin);
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
