import {
  buildDriverAssignmentEmail,
  type BookingJobRecord,
} from "../shared/booking-job";
import {
  driverNamesMatch,
  jobAssignmentStatus,
  type JobAssignmentStatus,
  type TrackingJobRecord,
} from "../shared/tracking";
import { enrichDriverJob } from "./driver-booking-handlers";
import {
  isConfiguredDriver,
  listConfiguredDrivers,
  ownerAuthorized,
  resolveDriverSession,
  type DashboardRole,
  type DriverAuthEnv,
} from "./driver-auth";
import { corsHeaders } from "../shared/google-places";
import {
  generateDriverAcceptToken,
  getBookingJob,
  saveBookingJob,
} from "./booking-job-store";
import {
  getTrackingJob,
  isTrackingJobCancelled,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendEmail, type WorkerEmailEnv } from "./worker-email";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    AERODATABOX_RAPIDAPI_KEY?: string;
    SITE_URL?: string;
  };

const BUSINESS_NAME = "My Airport Taxi NI";
const DEFAULT_SITE_URL = "https://www.myairporttaxini.co.uk";

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function siteUrl(env: Env): string {
  return env.SITE_URL?.trim() || DEFAULT_SITE_URL;
}

function stopDriverSharing(record: TrackingJobRecord): void {
  record.sharingActive = false;
  delete record.driverLat;
  delete record.driverLng;
  delete record.driverUpdatedAt;
  delete record.activeDriverName;
}

function clearJobAssignment(record: TrackingJobRecord): void {
  delete record.assignedDriverName;
  delete record.assignmentStatus;
  delete record.assignedAt;
  delete record.acceptedAt;
  delete record.declinedAt;
  stopDriverSharing(record);
}

function assignmentFields(record: TrackingJobRecord) {
  return {
    assignedDriverName: record.assignedDriverName,
    assignmentStatus: jobAssignmentStatus(record),
    assignedAt: record.assignedAt,
    acceptedAt: record.acceptedAt,
    declinedAt: record.declinedAt,
  };
}

function bookingJobFromTracking(
  record: TrackingJobRecord,
  id: string,
): BookingJobRecord {
  return {
    id,
    createdAt: record.createdAt || new Date().toISOString(),
    status: "paid",
    kind: "booking-request",
    customerName: record.customerName,
    customerEmail: record.customerEmail ?? "",
    customerMobile: record.customerMobile,
    tripLabel: "Airport transfer",
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    returnJourney: false,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    flightNumber: record.flightNumber,
    passengers: 1,
    suitcases: 0,
    vehicle: "",
    isAirportTrip: Boolean(record.isAirportTrip),
    airportCode: record.airportCode,
    isFromAirport: record.isFromAirport,
    paymentReference: record.paymentReference || id,
    paidAt: new Date().toISOString(),
    amountPaidLabel: undefined,
  };
}

export async function handleDriverRosterRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  return jsonResponse(
    {
      ok: true,
      drivers: listConfiguredDrivers(env),
    },
    200,
    origin,
  );
}

export async function handleDriverAssignRequest(
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const driverFirstName = String(body.driverFirstName ?? body.driverName ?? "").trim();
  const driverEmail = String(body.driverEmail ?? "").trim().toLowerCase();
  const driverMobile = String(body.driverMobile ?? body.driverPhone ?? "").trim();
  const driverCarMake = String(body.driverCarMake ?? "").trim();
  const driverCarModel = String(body.driverCarModel ?? "").trim();
  const driverCarColour = String(body.driverCarColour ?? "").trim();
  const driverReg = String(body.driverReg ?? "").trim().toUpperCase();
  const driverPayAmount = String(body.driverPayAmount ?? "").trim();
  const emailAssign = Boolean(driverEmail || driverPayAmount);

  if (!token || !driverFirstName) {
    return jsonResponse({ error: "Missing token or driver name" }, 400, origin);
  }

  if (emailAssign) {
    if (!driverEmail || !driverPayAmount) {
      return jsonResponse(
        { error: "Enter driver email and the amount you are paying them" },
        400,
        origin,
      );
    }
    if (!driverMobile) {
      return jsonResponse({ error: "Enter the driver’s mobile number" }, 400, origin);
    }
    if (!driverEmail.includes("@")) {
      return jsonResponse({ error: "Enter a valid driver email" }, 400, origin);
    }
  } else if (!isConfiguredDriver(env, driverFirstName)) {
    return jsonResponse(
      { error: "Unknown driver — check DRIVER_ROSTER or DRIVER_NAME" },
      400,
      origin,
    );
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  if (isTrackingJobCancelled(record)) {
    return jsonResponse({ error: "This booking has been cancelled" }, 409, origin);
  }

  const now = new Date().toISOString();
  record.assignedDriverName = driverFirstName;
  record.assignmentStatus = "pending";
  record.assignedAt = now;
  delete record.acceptedAt;
  delete record.declinedAt;
  stopDriverSharing(record);

  await saveTrackingJob(env.TRACKING_STORE, record);

  let emailed = false;
  let acceptUrl: string | undefined;
  let emailError: string | undefined;

  if (emailAssign) {
    const bookingId =
      record.paymentReference?.trim() ||
      String(body.bookingJobId ?? "").trim() ||
      `track-${token}`;

    let bookingJob = await getBookingJob(env.TRACKING_STORE, bookingId);
    if (!bookingJob && record.paymentReference?.trim()) {
      bookingJob = await getBookingJob(env.TRACKING_STORE, record.paymentReference.trim());
    }
    if (!bookingJob) {
      bookingJob = bookingJobFromTracking(record, bookingId);
    }

    if (bookingJob.status === "awaiting_payment") {
      bookingJob = {
        ...bookingJob,
        status: "paid",
        paidAt: now,
        paymentReference: bookingJob.paymentReference || record.paymentReference || bookingJob.id,
      };
    }

    const acceptToken = generateDriverAcceptToken();
    const updatedBooking: BookingJobRecord = {
      ...bookingJob,
      driverFirstName,
      driverEmail,
      driverMobile: driverMobile || undefined,
      driverCarMake: driverCarMake || undefined,
      driverCarModel: driverCarModel || undefined,
      driverCarColour: driverCarColour || undefined,
      driverReg: driverReg || undefined,
      driverPayAmount,
      driverAssignmentStatus: "pending",
      driverAcceptToken: acceptToken,
      assignedAt: now,
      driverAcceptedAt: undefined,
      driverDeclinedAt: undefined,
    };

    await saveBookingJob(env.TRACKING_STORE, updatedBooking);

    acceptUrl = `${siteUrl(env).replace(/\/$/, "")}/driver-accept/?token=${encodeURIComponent(acceptToken)}`;
    const email = buildDriverAssignmentEmail({
      job: updatedBooking,
      acceptUrl,
      businessName: BUSINESS_NAME,
    });

    const sendResult = await trySendEmail(env, {
      to: driverEmail,
      toName: driverFirstName,
      subject: email.subject,
      body: email.text,
      htmlBody: email.html,
      requireHtml: true,
    });

    emailed = sendResult.sent;
    if (!sendResult.sent) {
      emailError = sendResult.error || "Failed to email driver";
    } else {
      // Always keep an owner copy of exactly what the driver was emailed.
      const ownerTo = env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk";
      const ownerCopy = await trySendEmail(env, {
        to: ownerTo,
        toName: BUSINESS_NAME,
        subject: `[Driver assignment copy] ${email.subject}`,
        body:
          `This is a copy of the assignment email sent to ${driverFirstName} <${driverEmail}>.\n\n` +
          email.text,
        htmlBody: email.html,
        requireHtml: true,
      });
      if (!ownerCopy.sent) {
        console.warn("Owner driver-assignment copy failed", ownerCopy.error);
      }
    }
  }

  const role: DashboardRole = "owner";
  const job = await enrichDriverJob(record, env, origin, role);

  if (emailAssign && !emailed) {
    return jsonResponse(
      {
        ok: false,
        error: emailError || "Failed to email driver",
        job,
        acceptUrl,
        ...assignmentFields(record),
      },
      502,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      job,
      emailed,
      acceptUrl,
      ...assignmentFields(record),
    },
    200,
    origin,
  );
}

export async function handleDriverDeassignRequest(
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

  if (isTrackingJobCancelled(record)) {
    return jsonResponse({ error: "This booking has been cancelled" }, 409, origin);
  }

  if (jobAssignmentStatus(record) === "unassigned") {
    return jsonResponse({ error: "This job is not assigned to a driver" }, 409, origin);
  }

  clearJobAssignment(record);
  await saveTrackingJob(env.TRACKING_STORE, record);

  const job = await enrichDriverJob(record, env, origin, "owner");

  return jsonResponse(
    {
      ok: true,
      job,
      ...assignmentFields(record),
    },
    200,
    origin,
  );
}

export async function handleDriverAssignmentResponseRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  const session = resolveDriverSession(request, env);
  if (!session.authorized || session.role !== "driver" || !session.driverName) {
    return jsonResponse({ error: "Unauthorized — driver access required" }, 401, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const action = String(body.action ?? "").trim().toLowerCase();

  if (!token || (action !== "accept" && action !== "decline")) {
    return jsonResponse({ error: "Missing token or invalid action (accept/decline)" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  if (isTrackingJobCancelled(record)) {
    return jsonResponse({ error: "This booking has been cancelled" }, 409, origin);
  }

  if (jobAssignmentStatus(record) !== "pending") {
    return jsonResponse({ error: "This job is not awaiting your response" }, 409, origin);
  }

  if (!driverNamesMatch(record.assignedDriverName, session.driverName)) {
    return jsonResponse({ error: "This job is not assigned to you" }, 403, origin);
  }

  const now = new Date().toISOString();
  if (action === "accept") {
    record.assignmentStatus = "accepted";
    record.acceptedAt = now;
    delete record.declinedAt;
  } else {
    record.assignmentStatus = "declined";
    record.declinedAt = now;
    delete record.acceptedAt;
    stopDriverSharing(record);
  }

  await saveTrackingJob(env.TRACKING_STORE, record);

  const job = await enrichDriverJob(record, env, origin, "driver");

  return jsonResponse(
    {
      ok: true,
      action,
      job,
      ...assignmentFields(record),
    },
    200,
    origin,
  );
}

export type { JobAssignmentStatus };
