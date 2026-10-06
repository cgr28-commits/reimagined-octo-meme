import {
  bookingJobAssignmentLabel,
  buildDriverAssignmentEmail,
  type BookingJobKind,
  type BookingJobRecord,
} from "../shared/booking-job";
import {
  buildDriverAcceptLookupResponse,
  completeDriverAcceptConfirmation,
  driverPortalMagicLink,
} from "../shared/driver-portal-access";
import {
  assignmentIdentityFromProfile,
  driverProfileComplete,
  savedProfileAssignmentDecision,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";
import {
  applyDriverPayAssignment,
  driverPayBlocksReassignment,
  mutateDriverPayFields,
  oweDriverPayOnCompletion,
  formatDriverPayFromPence,
  parseDriverPayToPence,
} from "../shared/driver-pay-ledger";
import { journeyStatusOf, type TrackingJobRecord } from "../shared/tracking";
import { corsHeaders } from "../shared/google-places";
import { sanitizeAdsAttribution } from "../shared/ads-attribution";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { logBookingsToGoogleCalendar } from "./google-calendar";
import {
  bookingJobStoreConfigured,
  deleteDriverAcceptToken,
  generateDriverAcceptToken,
  getBookingJob,
  getBookingJobByAcceptToken,
  listBookingJobsForDateRange,
  saveBookingJob,
} from "./booking-job-store";
import { createDriverPortalLink } from "./driver-portal-session";
import { findSavedDriverProfileByEmail, getDriverVehicleProfile } from "./driver-vehicle-store";
import {
  createTrackingJobFromBooking,
  findTrackingJobsByPaymentReference,
  getTrackingJob,
  isTrackingJobCancelled,
  saveTrackingJob,
} from "./tracking-store";
import { trySendEmail, type WorkerEmailEnv } from "./worker-email";

async function trackingJobsForBooking(
  store: KVNamespace,
  job: BookingJobRecord,
): Promise<TrackingJobRecord[]> {
  const paymentRef = job.paymentReference?.trim() || job.id;
  const tracked = await findTrackingJobsByPaymentReference(store, paymentRef);
  const byId = await findTrackingJobsByPaymentReference(store, job.id);
  const legacy = await getTrackingJob(store, job.id);
  const jobs = [...tracked, ...byId];
  if (legacy && !jobs.some((entry) => entry.token === legacy.token)) {
    jobs.push(legacy);
  }
  const seen = new Set<string>();
  return jobs.filter((entry) => {
    if (seen.has(entry.token)) return false;
    seen.add(entry.token);
    return true;
  });
}

async function syncTrackingAssignmentFromBooking(
  store: KVNamespace,
  job: BookingJobRecord,
  options?: { resetPay?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const jobs = await trackingJobsForBooking(store, job);
  if (jobs.length === 0) {
    return { ok: true };
  }

  const status = job.driverAssignmentStatus ?? "unassigned";
  const resetSingleJourneyPay = Boolean(options?.resetPay && jobs.length === 1);
  if (options?.resetPay || status === "unassigned") {
    for (const tracking of jobs) {
      const blocked = driverPayBlocksReassignment(tracking);
      if (blocked) return { ok: false, error: blocked };
    }
  }

  const nowIso = job.assignedAt || new Date().toISOString();
  for (const tracking of jobs) {
    if (status === "unassigned") {
      delete tracking.assignedDriverName;
      delete tracking.assignmentStatus;
      delete tracking.assignedAt;
      delete tracking.acceptedAt;
      delete tracking.declinedAt;
      delete tracking.assignedDriverProfileKey;
      delete tracking.assignedDriverMobile;
      delete tracking.assignedDriverEmail;
      delete tracking.assignedDriverCarMake;
      delete tracking.assignedDriverCarModel;
      delete tracking.assignedDriverCarColour;
      delete tracking.assignedDriverReg;
      delete tracking.driverPayAmount;
      delete tracking.driverPayAmountPence;
      delete tracking.driverPayStatus;
      delete tracking.driverPayPaidAt;
      delete tracking.driverPayMethod;
      delete tracking.driverPayProviderReference;
      delete tracking.driverPayStatusUpdatedAt;
      delete tracking.driverPayDriverProfileKey;
      delete tracking.driverPayDriverName;
    } else {
      tracking.assignedDriverName = job.driverFirstName?.trim() || tracking.assignedDriverName;
      tracking.assignmentStatus = status;
      tracking.assignedAt = job.assignedAt || tracking.assignedAt || nowIso;
      if (job.driverProfileKey?.trim()) tracking.assignedDriverProfileKey = job.driverProfileKey.trim();
      else delete tracking.assignedDriverProfileKey;
      if (job.driverMobile?.trim()) tracking.assignedDriverMobile = job.driverMobile.trim();
      if (job.driverEmail?.trim()) tracking.assignedDriverEmail = job.driverEmail.trim();
      if (job.driverCarMake?.trim()) tracking.assignedDriverCarMake = job.driverCarMake.trim();
      if (job.driverCarModel?.trim()) tracking.assignedDriverCarModel = job.driverCarModel.trim();
      if (job.driverCarColour?.trim()) tracking.assignedDriverCarColour = job.driverCarColour.trim();
      if (job.driverReg?.trim()) tracking.assignedDriverReg = job.driverReg.trim();
      if (resetSingleJourneyPay && job.driverPayAmount?.trim()) {
        const applied = applyDriverPayAssignment(tracking, {
          amountInput: job.driverPayAmount,
          driverName: job.driverFirstName?.trim() || tracking.assignedDriverName || "Driver",
          profileKey: job.driverProfileKey,
          nowIso,
        });
        if (!applied.ok) return applied;
        mutateDriverPayFields(tracking, applied.record);
        if (journeyStatusOf(tracking) === "completed" && !isTrackingJobCancelled(tracking)) {
          const owed = oweDriverPayOnCompletion(tracking, { nowIso, cancelled: false });
          if (owed.changed) mutateDriverPayFields(tracking, owed.job);
        }
      }
      if (status === "accepted") {
        tracking.acceptedAt = job.driverAcceptedAt || new Date().toISOString();
        delete tracking.declinedAt;
      } else if (status === "declined") {
        tracking.declinedAt = job.driverDeclinedAt || new Date().toISOString();
        delete tracking.acceptedAt;
      } else {
        delete tracking.acceptedAt;
        delete tracking.declinedAt;
      }
      tracking.sharingActive = false;
      delete tracking.driverLat;
      delete tracking.driverLng;
      delete tracking.driverUpdatedAt;
      delete tracking.activeDriverName;
    }

    await saveTrackingJob(store, tracking);
  }
  return { ok: true };
}

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
    GOOGLE_CALENDAR_ID?: string;
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

function calendarConfigured(env: Env): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function createBookingJobFromSubmission(
  store: KVNamespace,
  options: {
    bookingReference: string;
    kind: BookingJobKind;
    booking: Record<string, unknown>;
    message?: string;
  },
): Promise<BookingJobRecord | null> {
  const b = options.booking;
  const customerName = String(b.customerName ?? "").trim();
  const tripDate = String(b.tripDate ?? "").trim();
  const tripTime = String(b.tripTime ?? "").trim();
  if (!customerName || !tripDate || !tripTime) {
    return null;
  }

  const job: BookingJobRecord = {
    id: options.bookingReference,
    createdAt: new Date().toISOString(),
    status: "awaiting_payment",
    kind: options.kind,
    customerName,
    customerEmail: String(b.customerEmail ?? "").trim(),
    customerMobile: String(b.mobileNumber ?? "").trim(),
    tripLabel: String(b.tripLabel ?? "Airport transfer").trim(),
    pickupLabel: String(b.pickupLabel ?? "").trim(),
    dropoffLabel: String(b.dropoffLabel ?? "").trim(),
    returnJourney: b.returnJourney === true,
    tripDate,
    tripTime,
    passengers: Number(b.passengers ?? 1) || 1,
    suitcases: Number(b.suitcases ?? 0) || 0,
    vehicle: String(b.vehicle ?? "").trim(),
    quotedPrice:
      typeof b.estimatedPrice === "string" || b.estimatedPrice === null
        ? (b.estimatedPrice as string | null)
        : null,
    isAirportTrip: b.isAirportTrip === true,
    message: options.message?.trim() || undefined,
    attribution: sanitizeAdsAttribution(b.attribution),
    driverAssignmentStatus: "unassigned",
  };

  if (typeof b.returnDate === "string" && b.returnDate.trim()) {
    job.returnDate = b.returnDate.trim();
  }
  if (typeof b.returnTime === "string" && b.returnTime.trim()) {
    job.returnTime = b.returnTime.trim();
  }
  if (typeof b.flightNumber === "string" && b.flightNumber.trim()) {
    job.flightNumber = b.flightNumber.trim().toUpperCase();
  }
  if (typeof b.returnFlightNumber === "string" && b.returnFlightNumber.trim()) {
    job.returnFlightNumber = b.returnFlightNumber.trim().toUpperCase();
  }
  if (typeof b.airportCode === "string" && b.airportCode.trim()) {
    job.airportCode = b.airportCode.trim().toUpperCase();
  }
  if (typeof b.isFromAirport === "boolean") {
    job.isFromAirport = b.isFromAirport;
  }
  if (typeof b.pickupPlaceId === "string" && b.pickupPlaceId.trim()) {
    job.pickupPlaceId = b.pickupPlaceId.trim();
  }
  if (typeof b.dropoffPlaceId === "string" && b.dropoffPlaceId.trim()) {
    job.dropoffPlaceId = b.dropoffPlaceId.trim();
  }
  if (typeof b.quoteTransactionId === "string" && b.quoteTransactionId.trim()) {
    job.quoteTransactionId = b.quoteTransactionId.trim();
  }

  await saveBookingJob(store, job);
  return job;
}

export async function handleBookingJobsListRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!bookingJobStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured" }, 503, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  const url = new URL(request.url);
  const today = todayLondon();
  const from = url.searchParams.get("from")?.trim() || addDays(today, -7);
  const to = url.searchParams.get("to")?.trim() || addDays(today, 45);
  // Include enquiries created in the last 21 days even when their trip date is
  // outside the trip-date window (so “booking from yesterday” always appears).
  const jobs = await listBookingJobsForDateRange(env.TRACKING_STORE, from, to, {
    createdFrom: addDays(today, -21),
    createdTo: today,
  });

  return jsonResponse({ ok: true, jobs }, 200, origin);
}

export async function handleBookingJobMarkPaidRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!bookingJobStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured" }, 503, origin);
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

  const id = String(body.id ?? "").trim();
  const amountPaidLabel = String(body.amountPaidLabel ?? "").trim();
  const paymentReference = String(body.paymentReference ?? "").trim();

  if (!id) {
    return jsonResponse({ error: "Missing booking id" }, 400, origin);
  }

  const job = await getBookingJob(env.TRACKING_STORE, id);
  if (!job) {
    return jsonResponse({ error: "Booking not found" }, 404, origin);
  }

  let calendarEventIds = job.calendarEventIds ?? [];
  let calendarLogged = Boolean(job.calendarLogged);
  let calendarError: string | undefined;

  if (!calendarLogged && calendarConfigured(env)) {
    try {
      calendarEventIds = await logBookingsToGoogleCalendar({
        serviceAccountJson: env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!,
        calendarId: env.GOOGLE_CALENDAR_ID!.trim(),
        customerName: job.customerName,
        message: job.message ?? "",
        booking: {
          customerName: job.customerName,
          customerEmail: job.customerEmail,
          mobileNumber: job.customerMobile,
          tripLabel: job.tripLabel,
          pickupLabel: job.pickupLabel,
          dropoffLabel: job.dropoffLabel,
          returnJourney: job.returnJourney,
          tripDate: job.tripDate,
          tripTime: job.tripTime,
          returnDate: job.returnDate,
          returnTime: job.returnTime,
          flightNumber: job.flightNumber,
          returnFlightNumber: job.returnFlightNumber,
          passengers: job.passengers,
          suitcases: job.suitcases,
          vehicle: job.vehicle,
          estimatedPrice: amountPaidLabel || job.quotedPrice || null,
          isAirportTrip: job.isAirportTrip,
          amountPaid: amountPaidLabel || undefined,
          paymentReference: paymentReference || job.id,
          paid: true,
        },
        tour: null,
      });
      calendarLogged = true;
    } catch (error) {
      calendarError = error instanceof Error ? error.message : "Calendar error";
      console.error("Mark-paid calendar failed", calendarError);
    }
  }

  const updated: BookingJobRecord = {
    ...job,
    status: "paid",
    amountPaidLabel: amountPaidLabel || job.amountPaidLabel || job.quotedPrice || undefined,
    paymentReference: paymentReference || job.paymentReference || job.id,
    paidAt: new Date().toISOString(),
    calendarEventIds,
    calendarLogged,
  };
  await saveBookingJob(env.TRACKING_STORE, updated);

  // Create outbound (+ return) tracking jobs so Paid jobs / Pick date show both legs.
  // Idempotent — also backfills a missing return leg if mark-paid is run again.
  try {
    await createTrackingJobFromBooking(
      env.TRACKING_STORE,
      {
        customerName: job.customerName,
        customerEmail: job.customerEmail,
        mobileNumber: job.customerMobile,
        tripLabel: job.tripLabel,
        pickupLabel: job.pickupLabel,
        dropoffLabel: job.dropoffLabel,
        returnJourney: job.returnJourney,
        tripDate: job.tripDate,
        tripTime: job.tripTime,
        returnDate: job.returnDate ?? "",
        returnTime: job.returnTime ?? "",
        flightNumber: job.flightNumber ?? "",
        returnFlightNumber: job.returnFlightNumber,
        passengers: job.passengers,
        suitcases: job.suitcases,
        vehicle: job.vehicle,
        isAirportTrip: job.isAirportTrip,
        airportCode: job.airportCode,
        isFromAirport: job.isFromAirport,
      },
      updated.paymentReference,
    );
  } catch (error) {
    console.error("Mark-paid tracking job create failed", error);
  }

  return jsonResponse(
    {
      ok: true,
      job: updated,
      calendarLogged,
      calendarError,
    },
    200,
    origin,
  );
}

export async function handleBookingJobAssignDriverRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!bookingJobStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured" }, 503, origin);
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

  const id = String(body.id ?? "").trim();
  const driverFirstName = String(body.driverFirstName ?? "").trim();
  const driverEmail = String(body.driverEmail ?? "").trim().toLowerCase();
  const driverMobile = String(body.driverMobile ?? body.driverPhone ?? "").trim();
  const driverCarMake = String(body.driverCarMake ?? "").trim();
  const driverCarModel = String(body.driverCarModel ?? "").trim();
  const driverCarColour = String(body.driverCarColour ?? "").trim();
  const driverReg = String(body.driverReg ?? "").trim().toUpperCase();
  const driverPayAmount = String(body.driverPayAmount ?? "").trim();
  const requestedProfileKey = String(body.driverProfileKey ?? body.profileKey ?? "").trim();
  const parsedPay = parseDriverPayToPence(driverPayAmount);

  if (!id || !driverFirstName || !driverEmail || !driverPayAmount) {
    return jsonResponse(
      { error: "Missing id, driverFirstName, driverEmail, or driverPayAmount" },
      400,
      origin,
    );
  }

  if (!parsedPay.ok) {
    return jsonResponse({ error: parsedPay.error }, 400, origin);
  }

  if (!driverEmail.includes("@")) {
    return jsonResponse({ error: "Enter a valid driver email" }, 400, origin);
  }

  if (!driverMobile) {
    return jsonResponse({ error: "Enter the driver’s mobile number" }, 400, origin);
  }

  const job = await getBookingJob(env.TRACKING_STORE, id);
  if (!job) {
    return jsonResponse({ error: "Booking not found" }, 404, origin);
  }

  const linkedBeforeAssign = await trackingJobsForBooking(env.TRACKING_STORE, job);
  for (const tracking of linkedBeforeAssign) {
    const blocked = driverPayBlocksReassignment(tracking);
    if (blocked) {
      return jsonResponse({ error: blocked }, 409, origin);
    }
  }

  if (job.status !== "paid") {
    return jsonResponse(
      { error: "Mark the booking as paid before assigning a driver" },
      400,
      origin,
    );
  }

  let savedProfile: DriverVehicleProfile | null = null;
  if (requestedProfileKey) {
    const loaded = await getDriverVehicleProfile(env.TRACKING_STORE, requestedProfileKey);
    const decision = savedProfileAssignmentDecision({
      requestedProfileKey,
      loadedProfile: loaded,
      suppliedEmail: driverEmail,
    });
    if (!decision.ok) {
      return jsonResponse({ error: decision.error }, 400, origin);
    }
    savedProfile = decision.profile;
  } else {
    const byEmail = await findSavedDriverProfileByEmail(env.TRACKING_STORE, driverEmail);
    savedProfile = byEmail && driverProfileComplete(byEmail) ? byEmail : null;
  }
  const identity = savedProfile ? assignmentIdentityFromProfile(savedProfile) : null;

  const acceptToken = generateDriverAcceptToken();
  if (job.driverAcceptToken && job.driverAcceptToken !== acceptToken) {
    await deleteDriverAcceptToken(env.TRACKING_STORE, job.driverAcceptToken);
  }
  const updated: BookingJobRecord = {
    ...job,
    driverFirstName: identity?.driverFirstName || driverFirstName,
    driverEmail: identity?.driverEmail || driverEmail,
    driverMobile: identity?.driverMobile || driverMobile,
    driverCarMake: identity?.driverCarMake || driverCarMake || undefined,
    driverCarModel: identity?.driverCarModel || driverCarModel || undefined,
    driverCarColour: identity?.driverCarColour || driverCarColour || undefined,
    driverReg: identity?.driverReg || driverReg || undefined,
    driverPayAmount: formatDriverPayFromPence(parsedPay.pence),
    driverPayAmountPence: parsedPay.pence,
    driverProfileKey: identity?.driverProfileKey,
    driverAssignmentStatus: "pending",
    driverAcceptToken: acceptToken,
    assignedAt: new Date().toISOString(),
    driverAcceptedAt: undefined,
    driverDeclinedAt: undefined,
  };

  await saveBookingJob(env.TRACKING_STORE, updated);
  const synced = await syncTrackingAssignmentFromBooking(env.TRACKING_STORE, updated, { resetPay: true });
  if (!synced.ok) {
    return jsonResponse({ error: synced.error }, 409, origin);
  }

  const acceptUrl = `${siteUrl(env).replace(/\/$/, "")}/driver-accept/?token=${encodeURIComponent(acceptToken)}`;
  let portalUrl: string | undefined;
  if (savedProfile) {
    const accessToken = await createDriverPortalLink(env.TRACKING_STORE, {
      profileKey: savedProfile.profileKey,
      driverName: identity?.driverFirstName || savedProfile.displayName || driverFirstName,
    });
    portalUrl = driverPortalMagicLink(siteUrl(env), accessToken);
  }
  const email = buildDriverAssignmentEmail({
    job: updated,
    acceptUrl,
    businessName: BUSINESS_NAME,
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

  if (!sendResult.sent) {
    return jsonResponse(
      {
        ok: false,
        error: sendResult.error || "Failed to email driver",
        job: updated,
        acceptUrl,
      },
      502,
      origin,
    );
  }

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

  return jsonResponse(
    {
      ok: true,
      job: updated,
      emailed: true,
      acceptUrl,
      assignmentLabel: bookingJobAssignmentLabel(updated.driverAssignmentStatus),
    },
    200,
    origin,
  );
}

export async function handleDriverAcceptLookupRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!bookingJobStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured" }, 503, origin);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || "";
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const job = await getBookingJobByAcceptToken(env.TRACKING_STORE, token);
  if (!job) {
    return jsonResponse({ error: "Job not found or link expired" }, 404, origin);
  }

  return jsonResponse(
    {
      ok: true,
      job: buildDriverAcceptLookupResponse(job),
    },
    200,
    origin,
  );
}

export async function handleDriverAcceptConfirmRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!bookingJobStoreConfigured(store)) {
    return jsonResponse({ error: "Booking store is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const action = String(body.action ?? "").trim().toLowerCase();
  const result = await completeDriverAcceptConfirmation({
    action,
    token,
    loadByToken: (acceptToken) => getBookingJobByAcceptToken(store, acceptToken),
    saveJob: async (job) => {
      await saveBookingJob(store, job);
      await syncTrackingAssignmentFromBooking(store, job);
    },
    deleteAcceptToken: (acceptToken) => deleteDriverAcceptToken(store, acceptToken),
    issuePortalAccess: async (job) => {
      const profile = job.driverProfileKey
        ? await getDriverVehicleProfile(store, job.driverProfileKey)
        : job.driverEmail
          ? await findSavedDriverProfileByEmail(store, job.driverEmail)
          : null;
      const savedProfile = profile && driverProfileComplete(profile) ? profile : null;
      if (!savedProfile) {
        return { job };
      }
      const accessToken = await createDriverPortalLink(store, {
        profileKey: savedProfile.profileKey,
        driverName: savedProfile.displayName || job.driverFirstName || "Driver",
      });
      return {
        portalUrl: driverPortalMagicLink(siteUrl(env), accessToken),
        job: { ...job, driverProfileKey: savedProfile.profileKey },
      };
    },
  });

  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status, origin);
  }
  return jsonResponse(result.body, result.status, origin);
}
