import {
  bookingJobAssignmentLabel,
  buildDriverAssignmentEmail,
  type BookingJobKind,
  type BookingJobRecord,
} from "../shared/booking-job";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { logBookingsToGoogleCalendar } from "./google-calendar";
import {
  bookingJobStoreConfigured,
  generateDriverAcceptToken,
  getBookingJob,
  getBookingJobByAcceptToken,
  listBookingJobsForDateRange,
  saveBookingJob,
} from "./booking-job-store";
import { trySendEmail, type WorkerEmailEnv } from "./worker-email";

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
  const from = url.searchParams.get("from")?.trim() || addDays(todayLondon(), -7);
  const to = url.searchParams.get("to")?.trim() || addDays(todayLondon(), 45);
  const jobs = await listBookingJobsForDateRange(env.TRACKING_STORE, from, to);

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
  const driverCarMake = String(body.driverCarMake ?? "").trim();
  const driverCarModel = String(body.driverCarModel ?? "").trim();
  const driverReg = String(body.driverReg ?? "").trim().toUpperCase();
  const driverPayAmount = String(body.driverPayAmount ?? "").trim();

  if (!id || !driverFirstName || !driverEmail || !driverPayAmount) {
    return jsonResponse(
      { error: "Missing id, driverFirstName, driverEmail, or driverPayAmount" },
      400,
      origin,
    );
  }

  if (!driverEmail.includes("@")) {
    return jsonResponse({ error: "Enter a valid driver email" }, 400, origin);
  }

  const job = await getBookingJob(env.TRACKING_STORE, id);
  if (!job) {
    return jsonResponse({ error: "Booking not found" }, 404, origin);
  }

  if (job.status !== "paid") {
    return jsonResponse(
      { error: "Mark the booking as paid before assigning a driver" },
      400,
      origin,
    );
  }

  const acceptToken = generateDriverAcceptToken();
  const updated: BookingJobRecord = {
    ...job,
    driverFirstName,
    driverEmail,
    driverCarMake: driverCarMake || undefined,
    driverCarModel: driverCarModel || undefined,
    driverReg: driverReg || undefined,
    driverPayAmount,
    driverAssignmentStatus: "pending",
    driverAcceptToken: acceptToken,
    assignedAt: new Date().toISOString(),
    driverAcceptedAt: undefined,
    driverDeclinedAt: undefined,
  };

  await saveBookingJob(env.TRACKING_STORE, updated);

  const acceptUrl = `${siteUrl(env).replace(/\/$/, "")}/driver-accept/?token=${encodeURIComponent(acceptToken)}`;
  const email = buildDriverAssignmentEmail({
    job: updated,
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
      job: {
        id: job.id,
        customerName: job.customerName,
        pickupLabel: job.pickupLabel,
        dropoffLabel: job.dropoffLabel,
        tripDate: job.tripDate,
        tripTime: job.tripTime,
        driverFirstName: job.driverFirstName,
        driverPayAmount: job.driverPayAmount,
        driverAssignmentStatus: job.driverAssignmentStatus ?? "unassigned",
        vehicle: job.vehicle,
        driverCarMake: job.driverCarMake,
        driverCarModel: job.driverCarModel,
        driverReg: job.driverReg,
      },
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
  if (!bookingJobStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const action = String(body.action ?? "accept").trim().toLowerCase();
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }

  const job = await getBookingJobByAcceptToken(env.TRACKING_STORE, token);
  if (!job) {
    return jsonResponse({ error: "Job not found or link expired" }, 404, origin);
  }

  if (job.driverAssignmentStatus === "accepted") {
    return jsonResponse({ ok: true, job, alreadyAccepted: true }, 200, origin);
  }

  const updated: BookingJobRecord = {
    ...job,
    driverAssignmentStatus: action === "decline" ? "declined" : "accepted",
    driverAcceptedAt: action === "decline" ? undefined : new Date().toISOString(),
    driverDeclinedAt: action === "decline" ? new Date().toISOString() : undefined,
  };
  await saveBookingJob(env.TRACKING_STORE, updated);

  return jsonResponse({ ok: true, job: updated }, 200, origin);
}
