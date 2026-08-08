import {
  bookingJobAssignmentLabel,
  buildDriverAssignmentEmail,
  type BookingJobKind,
  type BookingJobRecord,
} from "../shared/booking-job";
import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  formatPaidAmount,
} from "../shared/booking-notifications";
import { corsHeaders } from "../shared/google-places";
import {
  buildCheckoutReference,
  createSumUpHostedCheckout,
  getSumUpCheckout,
  getSuccessfulTransactionCode,
  isSumUpCheckoutPaid,
} from "../shared/sumup-checkout";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { logBookingsToGoogleCalendar } from "./google-calendar";
import {
  bookingJobStoreConfigured,
  generateDriverAcceptToken,
  getBookingJob,
  getBookingJobByAcceptToken,
  getBookingJobByCheckoutId,
  listBookingJobsForDateRange,
  saveBookingJob,
  saveBookingJobCheckoutIndex,
} from "./booking-job-store";
import {
  createTrackingJobFromBooking,
  findTrackingJobsByPaymentReference,
  getTrackingJob,
  saveTrackingJob,
} from "./tracking-store";
import {
  trySendBrandedCustomerEmail,
  trySendEmail,
  type WorkerEmailEnv,
} from "./worker-email";

async function syncTrackingAssignmentFromBooking(
  store: KVNamespace,
  job: BookingJobRecord,
): Promise<void> {
  const paymentRef = job.paymentReference?.trim() || job.id;
  const tracked = await findTrackingJobsByPaymentReference(store, paymentRef);
  const byId = await findTrackingJobsByPaymentReference(store, job.id);
  const legacy = await getTrackingJob(store, job.id);
  const jobs = [...tracked, ...byId];
  if (legacy && !jobs.some((entry) => entry.token === legacy.token)) {
    jobs.push(legacy);
  }
  if (jobs.length === 0) {
    return;
  }

  const status = job.driverAssignmentStatus ?? "unassigned";
  for (const tracking of jobs) {
    if (status === "unassigned") {
      delete tracking.assignedDriverName;
      delete tracking.assignmentStatus;
      delete tracking.assignedAt;
      delete tracking.acceptedAt;
      delete tracking.declinedAt;
    } else {
      tracking.assignedDriverName = job.driverFirstName?.trim() || tracking.assignedDriverName;
      tracking.assignmentStatus = status;
      tracking.assignedAt = job.assignedAt || tracking.assignedAt || new Date().toISOString();
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
}

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
    GOOGLE_CALENDAR_ID?: string;
    SITE_URL?: string;
    SUMUP_API_KEY?: string;
    SUMUP_MERCHANT_CODE?: string;
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

  const quotedPrice =
    typeof b.estimatedPrice === "string" || b.estimatedPrice === null
      ? (b.estimatedPrice as string | null)
      : null;
  // Priced booking requests need owner approval before the SumUp link is sent.
  const initialStatus =
    options.kind === "booking-request" && Boolean(quotedPrice?.trim())
      ? "awaiting_approval"
      : "awaiting_payment";

  const job: BookingJobRecord = {
    id: options.bookingReference,
    createdAt: new Date().toISOString(),
    status: initialStatus,
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
    quotedPrice,
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

  if (!driverMobile) {
    return jsonResponse({ error: "Enter the driver’s mobile number" }, 400, origin);
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
    driverMobile,
    driverCarMake: driverCarMake || undefined,
    driverCarModel: driverCarModel || undefined,
    driverCarColour: driverCarColour || undefined,
    driverReg: driverReg || undefined,
    driverPayAmount,
    driverAssignmentStatus: "pending",
    driverAcceptToken: acceptToken,
    assignedAt: new Date().toISOString(),
    driverAcceptedAt: undefined,
    driverDeclinedAt: undefined,
  };

  await saveBookingJob(env.TRACKING_STORE, updated);
  await syncTrackingAssignmentFromBooking(env.TRACKING_STORE, updated);

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

  const ownerTo = "bookings@myairporttaxini.co.uk";
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
  await syncTrackingAssignmentFromBooking(env.TRACKING_STORE, updated);

  return jsonResponse({ ok: true, job: updated }, 200, origin);
}

function parseQuotedPounds(label: string | null | undefined): number | null {
  if (!label?.trim()) {
    return null;
  }
  const match = label.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount >= 1 ? amount : null;
}

function formatJobDateDmy(date: string): string {
  const iso = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}-${iso[2]}-${iso[1]}`;
  }
  return date;
}

function jobToPaidBookingDetails(job: BookingJobRecord) {
  return {
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
    estimatedPrice: job.quotedPrice ?? null,
    isAirportTrip: job.isAirportTrip,
    airportCode: job.airportCode,
    isFromAirport: job.isFromAirport,
  };
}

/** Owner approves a priced booking and emails the customer a SumUp payment link. */
export async function handleBookingJobApproveRequest(
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

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) {
    return jsonResponse({ error: "SumUp payment is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return jsonResponse({ error: "Missing booking id" }, 400, origin);
  }

  const job = await getBookingJob(env.TRACKING_STORE, id);
  if (!job) {
    return jsonResponse({ error: "Booking not found" }, 404, origin);
  }

  if (job.status === "paid") {
    return jsonResponse({ error: "Booking is already paid" }, 400, origin);
  }

  if (job.kind === "vehicle-enquiry") {
    return jsonResponse(
      { error: "Vehicle enquiries need a manual quote before payment" },
      400,
      origin,
    );
  }

  const overrideAmount = parseQuotedPounds(String(body.amountLabel ?? "").trim());
  const amount = overrideAmount ?? parseQuotedPounds(job.quotedPrice);
  if (!amount) {
    return jsonResponse(
      { error: "Add a quoted price before approving (e.g. £85)" },
      400,
      origin,
    );
  }

  const amountLabel = `£${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  const checkoutReference = buildCheckoutReference(`matni-${job.id}`);
  const redirectUrl = `${siteUrl(env)}/booking-payment/?job=${encodeURIComponent(job.id)}`;
  const returnUrl = new URL("/payments/webhook", request.url).toString();

  let checkout: { checkoutId: string; paymentUrl: string; checkoutReference: string };
  try {
    checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount: Math.round(amount * 100) / 100,
      description: `${BUSINESS_NAME} — ${job.tripLabel} — ${job.id}`,
      checkoutReference,
      redirectUrl,
      returnUrl,
    });
  } catch (error) {
    console.error("Approve SumUp checkout failed", error);
    return jsonResponse({ error: "Could not create SumUp payment link" }, 502, origin);
  }

  const when = `${formatJobDateDmy(job.tripDate)} at ${job.tripTime}`;
  const paymentEmailText = [
    `Hi ${job.customerName},`,
    "",
    `Great news — we’ve confirmed your transfer with ${BUSINESS_NAME}.`,
    "",
    `Reference: ${job.id}`,
    `Trip: ${job.pickupLabel} → ${job.dropoffLabel}`,
    `When: ${when}`,
    `Amount: ${amountLabel}`,
    "",
    "Please pay securely online using this SumUp link:",
    checkout.paymentUrl,
    "",
    "Your booking is confirmed after payment. We’ll email your confirmation and add the trip to our calendar once paid.",
    "",
    `Questions? Call us or email ${env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk"}.`,
    "",
    BUSINESS_NAME,
  ].join("\n");

  const paymentEmailHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0b1b33">
      <p>Hi ${job.customerName},</p>
      <p>Great news — we’ve confirmed your transfer with <strong>${BUSINESS_NAME}</strong>.</p>
      <p><strong>Reference:</strong> ${job.id}<br/>
      <strong>Trip:</strong> ${job.pickupLabel} → ${job.dropoffLabel}<br/>
      <strong>When:</strong> ${when}<br/>
      <strong>Amount:</strong> ${amountLabel}</p>
      <p style="margin:24px 0">
        <a href="${checkout.paymentUrl}" style="display:inline-block;background:#2fbf4a;color:#071c38;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">
          Pay ${amountLabel} securely
        </a>
      </p>
      <p>Your booking is confirmed after payment. We’ll email your confirmation once paid.</p>
    </div>
  `.trim();

  const emailResult = await trySendBrandedCustomerEmail(env, {
    to: job.customerEmail,
    toName: job.customerName,
    subject: `Payment link — ${amountLabel} — ${BUSINESS_NAME}`,
    body: paymentEmailText,
    htmlBody: paymentEmailHtml,
  });

  if (!emailResult.sent) {
    console.error("Payment link email failed", emailResult.error);
    return jsonResponse(
      {
        error: emailResult.error
          ? `SumUp link created but email failed: ${emailResult.error}`
          : "SumUp link created but email failed",
        paymentUrl: checkout.paymentUrl,
        checkoutId: checkout.checkoutId,
      },
      502,
      origin,
    );
  }

  const updated: BookingJobRecord = {
    ...job,
    status: "awaiting_payment",
    quotedPrice: amountLabel,
    sumUpCheckoutId: checkout.checkoutId,
    sumUpPaymentUrl: checkout.paymentUrl,
    paymentLinkSentAt: new Date().toISOString(),
  };
  await saveBookingJob(env.TRACKING_STORE, updated);
  await saveBookingJobCheckoutIndex(env.TRACKING_STORE, checkout.checkoutId, job.id);

  return jsonResponse(
    {
      ok: true,
      job: updated,
      paymentUrl: checkout.paymentUrl,
      checkoutId: checkout.checkoutId,
      emailSent: true,
    },
    200,
    origin,
  );
}

/**
 * After the customer pays via the emailed SumUp link: verify payment, confirm by email,
 * add to Google Calendar, and mark the dashboard job paid.
 */
export async function handleBookingJobConfirmPaymentRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!bookingJobStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured" }, 503, origin);
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return jsonResponse({ error: "SumUp payment is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const checkoutIdHint = String(body.checkoutId ?? "").trim();
  const jobIdHint = String(body.jobId ?? "").trim();

  let job =
    (checkoutIdHint && checkoutIdHint !== "from-job"
      ? await getBookingJobByCheckoutId(env.TRACKING_STORE, checkoutIdHint)
      : null) ||
    (jobIdHint ? await getBookingJob(env.TRACKING_STORE, jobIdHint) : null);

  if (!job) {
    return jsonResponse({ error: "Booking not found for this payment" }, 404, origin);
  }

  const checkoutId =
    (checkoutIdHint && checkoutIdHint !== "from-job" ? checkoutIdHint : "") ||
    job.sumUpCheckoutId?.trim() ||
    "";

  if (!checkoutId) {
    return jsonResponse({ error: "Missing checkout id for this booking" }, 400, origin);
  }

  if (job.status === "paid") {
    return jsonResponse({ ok: true, alreadyPaid: true, job }, 200, origin);
  }

  try {
    const checkout = await getSumUpCheckout(apiKey, checkoutId);
    if (!isSumUpCheckoutPaid(checkout)) {
      return jsonResponse({ error: "Payment has not been completed yet" }, 402, origin);
    }

    const amountPaid = formatPaidAmount(checkout.amount ?? 0, checkout.currency ?? "GBP");
    const paymentReference =
      getSuccessfulTransactionCode(checkout) ?? checkout.checkout_reference ?? checkout.id;

    const booking = jobToPaidBookingDetails(job);
    const receipt = {
      ...booking,
      amountPaid,
      paymentReference,
      checkoutReference: checkout.checkout_reference,
    };

    const customerEmail = buildCustomerConfirmationEmail(receipt, BUSINESS_NAME, {});
    const ownerEmail = buildOwnerPaidBookingEmail(receipt, BUSINESS_NAME, {});

    const customerEmailResult = await trySendBrandedCustomerEmail(env, {
      to: job.customerEmail,
      toName: job.customerName,
      subject: customerEmail.subject,
      body: customerEmail.text,
      htmlBody: customerEmail.html,
    });

    await trySendEmail(env, {
      to: env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk",
      subject: ownerEmail.subject,
      body: ownerEmail.body,
    });

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
            ...booking,
            estimatedPrice: amountPaid,
            amountPaid,
            paymentReference,
            paid: true,
          },
          tour: null,
        });
        calendarLogged = true;
      } catch (error) {
        calendarError = error instanceof Error ? error.message : "Calendar error";
        console.error("Confirm-payment calendar failed", calendarError);
      }
    }

    const updated: BookingJobRecord = {
      ...job,
      status: "paid",
      amountPaidLabel: amountPaid,
      paymentReference,
      paidAt: new Date().toISOString(),
      sumUpCheckoutId: checkoutId,
      calendarEventIds,
      calendarLogged,
    };
    await saveBookingJob(env.TRACKING_STORE, updated);
    await saveBookingJobCheckoutIndex(env.TRACKING_STORE, checkoutId, job.id);

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
      console.error("Confirm-payment tracking create failed", error);
    }

    return jsonResponse(
      {
        ok: true,
        paid: true,
        job: updated,
        amountPaid,
        paymentReference,
        customerEmailSent: customerEmailResult.sent,
        calendarLogged,
        ...(calendarError ? { calendarWarning: calendarError } : {}),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("Booking job payment confirm failed", error);
    return jsonResponse({ error: "Could not confirm payment" }, 502, origin);
  }
}
