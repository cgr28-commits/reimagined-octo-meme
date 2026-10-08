import {
  buildDriverAssignmentEmail,
  type BookingJobRecord,
} from "../shared/booking-job";
import { authorizeDriverJobAction, driverPortalMagicLink } from "../shared/driver-portal-access";
import {
  assignmentIdentityFromProfile,
  driverProfileComplete,
  savedProfileAssignmentDecision,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";
import {
  applyDriverPayAssignment,
  clearDriverPayForDeassignment,
  driverPayBlocksDeassignment,
  driverPayBlocksReassignment,
  mutateDriverPayFields,
  oweDriverPayOnCompletion,
} from "../shared/driver-pay-ledger";
import {
  jobAssignmentStatus,
  journeyStatusOf,
  type JobAssignmentStatus,
  type TrackingJobRecord,
} from "../shared/tracking";
import { enrichDriverJob } from "./driver-booking-handlers";
import {
  isConfiguredDriver,
  listConfiguredDrivers,
  ownerAuthorized,
  type DashboardRole,
  type DriverAuthEnv,
} from "./driver-auth";
import { createDriverPortalLink, resolveAuthorizedSession } from "./driver-portal-session";
import { findSavedDriverProfileByEmail, getDriverVehicleProfile } from "./driver-vehicle-store";
import { corsHeaders } from "../shared/google-places";
import {
  deleteDriverAcceptToken,
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
import { syncDurableDriverPayFromTracking } from "./driver-pay-sync";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import { remainingCashDueGbp } from "../shared/deposit-cash";

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
  delete record.assignedDriverMobile;
  delete record.assignedDriverEmail;
  delete record.assignedDriverCarMake;
  delete record.assignedDriverCarModel;
  delete record.assignedDriverCarColour;
  delete record.assignedDriverReg;
  delete record.assignedDriverProfileKey;
  delete record.driverPayAmount;
  delete record.driverPayAmountPence;
  delete record.driverPayStatus;
  delete record.driverPayPaidAt;
  delete record.driverPayMethod;
  delete record.driverPayProviderReference;
  delete record.driverPayStatusUpdatedAt;
  delete record.driverPayDriverProfileKey;
  delete record.driverPayDriverName;
  stopDriverSharing(record);
}

async function resolveSavedAssignmentProfile(
  store: KVNamespace,
  profileKey: string,
  email: string,
): Promise<
  | { ok: true; profile: DriverVehicleProfile | null }
  | { ok: false; error: string }
> {
  if (profileKey) {
    const loaded = await getDriverVehicleProfile(store, profileKey);
    const decision = savedProfileAssignmentDecision({
      requestedProfileKey: profileKey,
      loadedProfile: loaded,
      suppliedEmail: email,
    });
    if (!decision.ok) return decision;
    return { ok: true, profile: decision.profile };
  }
  if (email) {
    const byEmail = await findSavedDriverProfileByEmail(store, email);
    if (byEmail && driverProfileComplete(byEmail)) {
      return { ok: true, profile: byEmail };
    }
  }
  return { ok: true, profile: null };
}

async function clearLinkedBookingAssignment(
  store: KVNamespace,
  record: TrackingJobRecord,
): Promise<void> {
  const ids = [record.paymentReference?.trim(), `track-${record.token}`].filter(
    (id): id is string => Boolean(id),
  );
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const job = await getBookingJob(store, id);
    if (!job) continue;
    await deleteDriverAcceptToken(store, job.driverAcceptToken);
    await saveBookingJob(store, {
      ...job,
      driverAssignmentStatus: "unassigned",
      driverAcceptToken: undefined,
      driverProfileKey: undefined,
      driverFirstName: undefined,
      driverEmail: undefined,
      driverMobile: undefined,
      driverCarMake: undefined,
      driverCarModel: undefined,
      driverCarColour: undefined,
      driverReg: undefined,
      driverPayAmount: undefined,
      driverPayAmountPence: undefined,
      driverAcceptedAt: undefined,
      driverDeclinedAt: undefined,
    });
  }
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
  const requestedProfileKey = String(body.driverProfileKey ?? body.profileKey ?? "").trim();
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
    if (!driverCarMake || !driverCarModel || !driverCarColour || !driverReg) {
      return jsonResponse(
        { error: "Complete the driver’s vehicle details (make, model, colour, registration) before assigning" },
        400,
        origin,
      );
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

  const paidBlock = driverPayBlocksReassignment(record);
  if (paidBlock) {
    return jsonResponse({ error: paidBlock }, 409, origin);
  }

  const resolvedProfile = await resolveSavedAssignmentProfile(
    env.TRACKING_STORE,
    requestedProfileKey,
    driverEmail,
  );
  if (!resolvedProfile.ok) {
    return jsonResponse({ error: resolvedProfile.error }, 400, origin);
  }
  const assignedProfile = resolvedProfile.profile;
  const identity = assignedProfile ? assignmentIdentityFromProfile(assignedProfile) : null;

  const now = new Date().toISOString();
  record.assignedDriverName = identity?.driverFirstName || driverFirstName;
  record.assignmentStatus = "pending";
  record.assignedAt = now;
  delete record.acceptedAt;
  delete record.declinedAt;
  // Snapshot operational driver details onto the tracking job (immutable for this journey).
  const assignedMobile = identity?.driverMobile || driverMobile;
  const assignedEmail = identity?.driverEmail || driverEmail;
  const assignedMake = identity?.driverCarMake || driverCarMake;
  const assignedModel = identity?.driverCarModel || driverCarModel;
  const assignedColour = identity?.driverCarColour || driverCarColour;
  const assignedReg = identity?.driverReg || driverReg;
  if (assignedMobile) record.assignedDriverMobile = assignedMobile;
  else delete record.assignedDriverMobile;
  if (assignedEmail) record.assignedDriverEmail = assignedEmail;
  else delete record.assignedDriverEmail;
  if (assignedMake) record.assignedDriverCarMake = assignedMake;
  else delete record.assignedDriverCarMake;
  if (assignedModel) record.assignedDriverCarModel = assignedModel;
  else delete record.assignedDriverCarModel;
  if (assignedColour) record.assignedDriverCarColour = assignedColour;
  else delete record.assignedDriverCarColour;
  if (assignedReg) record.assignedDriverReg = assignedReg;
  else delete record.assignedDriverReg;
  if (driverPayAmount) {
    const applied = applyDriverPayAssignment(record, {
      amountInput: driverPayAmount,
      driverName: identity?.driverFirstName || driverFirstName,
      profileKey: assignedProfile?.profileKey,
      nowIso: now,
    });
    if (!applied.ok) {
      return jsonResponse({ error: applied.error }, 400, origin);
    }
    mutateDriverPayFields(record, applied.record);
    if (journeyStatusOf(record) === "completed") {
      const owed = oweDriverPayOnCompletion(record, { nowIso: now, cancelled: false });
      if (owed.changed) mutateDriverPayFields(record, owed.job);
    }
  } else {
    const cleared = clearDriverPayForDeassignment(record);
    if (!cleared.ok) {
      return jsonResponse({ error: cleared.error }, 409, origin);
    }
    mutateDriverPayFields(record, cleared.record);
  }
  if (assignedProfile) record.assignedDriverProfileKey = assignedProfile.profileKey;
  else delete record.assignedDriverProfileKey;
  stopDriverSharing(record);

  await saveTrackingJob(env.TRACKING_STORE, record);
  await syncDurableDriverPayFromTracking(env.TRACKING_STORE, record);

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
    if (bookingJob.driverAcceptToken && bookingJob.driverAcceptToken !== acceptToken) {
      await deleteDriverAcceptToken(env.TRACKING_STORE, bookingJob.driverAcceptToken);
    }
    const updatedBooking: BookingJobRecord = {
      ...bookingJob,
      driverFirstName: identity?.driverFirstName || driverFirstName,
      driverEmail: identity?.driverEmail || driverEmail,
      driverMobile: identity?.driverMobile || driverMobile || undefined,
      driverCarMake: identity?.driverCarMake || driverCarMake || undefined,
      driverCarModel: identity?.driverCarModel || driverCarModel || undefined,
      driverCarColour: identity?.driverCarColour || driverCarColour || undefined,
      driverReg: identity?.driverReg || driverReg || undefined,
      driverPayAmount: record.driverPayAmount,
      driverPayAmountPence: record.driverPayAmountPence,
      driverProfileKey: assignedProfile?.profileKey,
      driverAssignmentStatus: "pending",
      driverAcceptToken: acceptToken,
      assignedAt: now,
      driverAcceptedAt: undefined,
      driverDeclinedAt: undefined,
    };

    await saveBookingJob(env.TRACKING_STORE, updatedBooking);

    acceptUrl = `${siteUrl(env).replace(/\/$/, "")}/driver-accept/?token=${encodeURIComponent(acceptToken)}`;
    let portalUrl: string | undefined;
    if (assignedProfile) {
      const accessToken = await createDriverPortalLink(env.TRACKING_STORE, {
        profileKey: assignedProfile.profileKey,
        driverName: identity?.driverFirstName || assignedProfile.displayName || driverFirstName,
      });
      portalUrl = driverPortalMagicLink(siteUrl(env), accessToken);
    }
    const paidRecord =
      paidBookingStoreConfigured(env.TRACKING_STORE) && record.paymentReference
        ? await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference)
        : null;
    const cashDue = paidRecord ? remainingCashDueGbp(paidRecord) : 0;
    const email = buildDriverAssignmentEmail({
      job: updatedBooking,
      acceptUrl,
      businessName: BUSINESS_NAME,
      ...(cashDue > 0 ? { cashBalanceDue: cashDue } : {}),
      ...(portalUrl ? { portalUrl } : {}),
    });

    const sendResult = await trySendEmail(env, {
      to: identity?.driverEmail || driverEmail,
      toName: identity?.driverFirstName || driverFirstName,
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
      const ownerTo = "bookings@myairporttaxini.co.uk";
      const ownerCopy = await trySendEmail(env, {
        to: ownerTo,
        toName: BUSINESS_NAME,
        subject: `[Driver assignment copy] ${email.subject}`,
        body:
          `This is a copy of the assignment email sent to ${identity?.driverFirstName || driverFirstName} <${identity?.driverEmail || driverEmail}>.\n\n` +
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

  const paidDeassignBlock = driverPayBlocksDeassignment(record);
  if (paidDeassignBlock) {
    return jsonResponse({ error: paidDeassignBlock }, 409, origin);
  }

  if (jobAssignmentStatus(record) === "unassigned") {
    return jsonResponse({ error: "This job is not assigned to a driver" }, 409, origin);
  }

  await clearLinkedBookingAssignment(env.TRACKING_STORE, record);
  clearJobAssignment(record);
  await saveTrackingJob(env.TRACKING_STORE, record);
  await syncDurableDriverPayFromTracking(env.TRACKING_STORE, record);

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

  const session = await resolveAuthorizedSession(request, env);
  if (!session.authorized || session.role !== "driver" || (!session.driverName && !session.profileKey)) {
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

  const accessError = authorizeDriverJobAction(session, record, body, "view");
  if (accessError) {
    return jsonResponse({ error: accessError }, 403, origin);
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

  if (action === "accept") {
    const { notifyJourneyDriverUpdateIfNeeded } = await import("./airport-pickup-reminder-handlers");
    await notifyJourneyDriverUpdateIfNeeded(env, record).catch((error) => {
      console.error("Updated driver details email failed", error);
    });
  }

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
