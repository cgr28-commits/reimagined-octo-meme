/**
 * Journey lifecycle + short-lived GPS session tokens + owner evidence pack (JSON).
 * Reuses TRACKING_STORE jobs — no separate booking database.
 */

import {
  applyJourneyAction,
  allowedJourneyActions,
  buildPublicTrackUrl,
  customerJourneyLabel,
  ensureReviewRequestScheduled,
  formatLondonDateTime,
  journeyStatusOf,
  resolveReviewRequestDelayMs,
  TRACKING_SESSION_TTL_SECONDS,
  type DriverLocationPoint,
  type JourneyAction,
  type TrackingJobRecord,
} from "../shared/tracking";
import {
  buildDriverArrivedPickupEmail,
  buildDriverOnTheWayEmail,
  customerFirstName,
} from "../shared/booking-notifications";
import { resolveAssignedDriverDetails } from "../shared/assigned-driver-details";
import { corsHeaders } from "../shared/google-places";
import {
  assertDriverCanOperateJob,
} from "./driver-assignment-utils";
import {
  driverAuthorized,
  ownerAuthorized,
  resolveDriverSession,
} from "./driver-auth";
import { getBookingJob } from "./booking-job-store";
import {
  createTrackingSession,
  createTrackingJobFromBooking,
  findTrackingJobsByPaymentReference,
  getDriverLocationHistory,
  getTrackingJob,
  gpsHistoryTtlSeconds,
  saveTrackingJob,
  TRACKING_JOB_TTL_SECONDS,
  trackingStoreConfigured,
} from "./tracking-store";
import { getDriverVehicleProfile } from "./driver-vehicle-store";
import { OWNER_VEHICLE_PROFILE_KEY } from "../shared/driver-vehicle";
import { getPaidBookingRecord, paidBookingStoreConfigured, savePaidBookingRecord } from "./paid-booking-store";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { buildReviewRequestSummary } from "./review-request-handlers";
import {
  trySendBrandedCustomerEmail,
  type WorkerEmailEnv,
} from "./worker-email";

type Env = {
  TRACKING_STORE?: KVNamespace;
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_NAME?: string;
  DRIVER_ROSTER?: string;
  /** Optional override for GPS audit retention (seconds). */
  TRACKING_GPS_HISTORY_TTL_SECONDS?: string;
  /** Minutes after journey completion before the Google review email (default 120). */
  REVIEW_REQUEST_DELAY_MINUTES?: string;
  /** WhatsApp Business API — not configured in this Worker yet (wa.me links do not count). */
  WHATSAPP_BUSINESS_API_TOKEN?: string;
  WHATSAPP_BUSINESS_PHONE_ID?: string;
  /** SMS provider — not configured in this Worker yet. */
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
} & WorkerEmailEnv;

const BUSINESS_NAME = "My Airport Taxi NI";

export type ArrivalChannelReport = {
  whatsappAutomatic: "AVAILABLE" | "NOT CONFIGURED";
  smsAutomatic: "AVAILABLE" | "NOT CONFIGURED";
  emailFallback: "AVAILABLE" | "NOT AVAILABLE";
};

export function arrivalChannelReport(env: Env): ArrivalChannelReport {
  const whatsapp =
    Boolean(env.WHATSAPP_BUSINESS_API_TOKEN?.trim()) &&
    Boolean(env.WHATSAPP_BUSINESS_PHONE_ID?.trim());
  const sms =
    Boolean(env.TWILIO_ACCOUNT_SID?.trim()) &&
    Boolean(env.TWILIO_AUTH_TOKEN?.trim()) &&
    Boolean(env.TWILIO_FROM_NUMBER?.trim());
  const email = Boolean(env.RESEND_API_KEY?.trim());
  return {
    whatsappAutomatic: whatsapp ? "AVAILABLE" : "NOT CONFIGURED",
    smsAutomatic: sms ? "AVAILABLE" : "NOT CONFIGURED",
    emailFallback: email ? "AVAILABLE" : "NOT AVAILABLE",
  };
}

/**
 * Idempotent customer arrival notification.
 * Prefer WhatsApp Business API → SMS → Resend email. wa.me links are not automatic.
 */
export async function sendArrivalNotificationIfNeeded(
  env: Env,
  job: TrackingJobRecord,
  options?: { forceRetry?: boolean },
): Promise<TrackingJobRecord> {
  if (job.arrivalNotificationStatus === "sent" && !options?.forceRetry) {
    return job;
  }

  const channels = arrivalChannelReport(env);
  const next: TrackingJobRecord = { ...job };

  // No fake WhatsApp/SMS automation — only real configured providers.
  if (channels.whatsappAutomatic === "AVAILABLE") {
    // Reserved for future WhatsApp Business API integration.
  }
  if (channels.smsAutomatic === "AVAILABLE") {
    // Reserved for future SMS provider integration.
  }

  if (channels.emailFallback !== "AVAILABLE") {
    next.arrivalNotificationStatus = "not_configured";
    next.arrivalNotificationError =
      "WhatsApp Business API and SMS are not configured; Resend email is also unavailable.";
    return next;
  }

  const emailAddress =
    job.customerEmail?.trim() ||
    (job.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)
      ? (await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference))?.customerEmail
      : undefined);

  if (!emailAddress?.trim()) {
    next.arrivalNotificationStatus = "failed";
    next.arrivalNotificationError = "No customer email on file for arrival notification";
    return next;
  }

  const email = buildDriverArrivedPickupEmail(
    { customerName: job.customerName || customerFirstName(emailAddress) },
    BUSINESS_NAME,
  );
  const result = await trySendBrandedCustomerEmail(env, {
    to: emailAddress.trim(),
    toName: job.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (result.sent) {
    next.arrivalNotificationStatus = "sent";
    next.arrivalNotificationSentAt = new Date().toISOString();
    next.arrivalNotificationProvider = "email";
    delete next.arrivalNotificationError;
  } else {
    next.arrivalNotificationStatus = "failed";
    next.arrivalNotificationError = result.error || "Arrival notification email failed";
  }

  return next;
}

/**
 * Idempotent customer "Driver on the way" notification.
 * Email with privacy-safe assigned-driver details; WhatsApp live location is optional (“may share”).
 */
export async function sendOnTheWayNotificationIfNeeded(
  env: Env,
  job: TrackingJobRecord,
  options?: { forceRetry?: boolean },
): Promise<TrackingJobRecord> {
  if (job.onTheWayNotificationStatus === "sent" && !options?.forceRetry) {
    return job;
  }

  const channels = arrivalChannelReport(env);
  const next: TrackingJobRecord = { ...job };

  if (channels.emailFallback !== "AVAILABLE") {
    next.onTheWayNotificationStatus = "not_configured";
    next.onTheWayNotificationError =
      "Resend email is unavailable for Driver on the way notification.";
    return next;
  }

  const emailAddress =
    job.customerEmail?.trim() ||
    (job.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)
      ? (await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference))?.customerEmail
      : undefined);

  if (!emailAddress?.trim()) {
    next.onTheWayNotificationStatus = "failed";
    next.onTheWayNotificationError = "No customer email on file for on-the-way notification";
    return next;
  }

  const bookingJob =
    job.paymentReference && env.TRACKING_STORE
      ? (await getBookingJob(env.TRACKING_STORE, job.paymentReference)) ??
        (await getBookingJob(env.TRACKING_STORE, job.token))
      : null;

  const ownerIsActiveDriver =
    !job.assignedDriverName?.trim() ||
    (env.DRIVER_NAME?.trim() &&
      job.assignedDriverName.trim().toLowerCase() === env.DRIVER_NAME.trim().toLowerCase() &&
      job.assignmentStatus === "accepted");

  let ownerFallback = null as
    | {
        driverName?: string;
        driverMobile?: string;
        carMake?: string;
        carModel?: string;
        carColour?: string;
        registration?: string;
      }
    | null;
  if (ownerIsActiveDriver && env.TRACKING_STORE) {
    try {
      const ownerProfile = await getDriverVehicleProfile(env.TRACKING_STORE, OWNER_VEHICLE_PROFILE_KEY);
      if (ownerProfile) {
        ownerFallback = {
          driverName: ownerProfile.displayName,
          driverMobile: ownerProfile.mobile,
          carMake: ownerProfile.make,
          carModel: ownerProfile.model,
          carColour: ownerProfile.colour,
          registration: ownerProfile.registration,
        };
      }
    } catch {
      /* optional */
    }
  }

  const details = resolveAssignedDriverDetails({
    tracking: {
      driverName: job.assignedDriverName,
      driverMobile: job.assignedDriverMobile,
      carMake: job.assignedDriverCarMake,
      carModel: job.assignedDriverCarModel,
      carColour: job.assignedDriverCarColour,
      registration: job.assignedDriverReg,
    },
    booking: bookingJob
      ? {
          driverName: bookingJob.driverFirstName,
          driverMobile: bookingJob.driverMobile,
          carMake: bookingJob.driverCarMake,
          carModel: bookingJob.driverCarModel,
          carColour: bookingJob.driverCarColour,
          registration: bookingJob.driverReg,
        }
      : null,
    ownerFallback,
    ownerIsActiveDriver: Boolean(ownerIsActiveDriver),
  });

  const email = buildDriverOnTheWayEmail(
    {
      customerName: job.customerName || customerFirstName(emailAddress),
      driverFirstName: details.driverFirstName || undefined,
      vehicleColour: details.carColour || undefined,
      partialRegistration: details.registrationPartial || undefined,
    },
    BUSINESS_NAME,
  );
  const result = await trySendBrandedCustomerEmail(env, {
    to: emailAddress.trim(),
    toName: job.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (result.sent) {
    next.onTheWayNotificationStatus = "sent";
    next.onTheWayNotificationSentAt = new Date().toISOString();
    next.onTheWayNotificationProvider = "email";
    delete next.onTheWayNotificationError;
  } else {
    next.onTheWayNotificationStatus = "failed";
    next.onTheWayNotificationError = result.error || "On-the-way notification email failed";
  }

  return next;
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

  const forceRetryArrival = Boolean(body.retryArrivalNotification);
  const forceRetryOnTheWay = Boolean(body.retryOnTheWayNotification);
  const alreadyArrived =
    action === "arrived_pickup" && journeyStatusOf(record) === "arrived_pickup";
  const alreadyOnTheWay =
    action === "start_tracking" &&
    (journeyStatusOf(record) === "tracking" ||
      (journeyStatusOf(record) === "idle" && Boolean(record.sharingActive)));

  // Idempotent Arrived at Pickup: keep original timestamp; optionally retry notification only.
  if (alreadyArrived) {
    let next = record;
    if (forceRetryArrival || record.arrivalNotificationStatus !== "sent") {
      next = await sendArrivalNotificationIfNeeded(env, record, {
        forceRetry: forceRetryArrival,
      });
      await saveTrackingJob(env.TRACKING_STORE, next);
    }
    const channels = arrivalChannelReport(env);
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
        arrivalNotificationStatus: next.arrivalNotificationStatus,
        arrivalNotificationSentAt: next.arrivalNotificationSentAt,
        arrivalNotificationProvider: next.arrivalNotificationProvider,
        arrivalNotificationError: next.arrivalNotificationError,
        onTheWayNotificationStatus: next.onTheWayNotificationStatus,
        onTheWayNotificationSentAt: next.onTheWayNotificationSentAt,
        onTheWayNotificationProvider: next.onTheWayNotificationProvider,
        onTheWayNotificationError: next.onTheWayNotificationError,
        arrivalChannels: channels,
        reviewRequest: buildReviewRequestSummary(next),
        idempotent: true,
      },
      200,
      origin,
    );
  }

  // Idempotent Driver on the way: keep status; optionally retry email; re-issue GPS session.
  if (alreadyOnTheWay) {
    let next = record;
    if (forceRetryOnTheWay || record.onTheWayNotificationStatus !== "sent") {
      next = await sendOnTheWayNotificationIfNeeded(env, record, {
        forceRetry: forceRetryOnTheWay,
      });
      await saveTrackingJob(env.TRACKING_STORE, next);
    }
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
    const channels = arrivalChannelReport(env);
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
        arrivalNotificationStatus: next.arrivalNotificationStatus,
        arrivalNotificationSentAt: next.arrivalNotificationSentAt,
        arrivalNotificationProvider: next.arrivalNotificationProvider,
        arrivalNotificationError: next.arrivalNotificationError,
        onTheWayNotificationStatus: next.onTheWayNotificationStatus,
        onTheWayNotificationSentAt: next.onTheWayNotificationSentAt,
        onTheWayNotificationProvider: next.onTheWayNotificationProvider,
        onTheWayNotificationError: next.onTheWayNotificationError,
        arrivalChannels: channels,
        reviewRequest: buildReviewRequestSummary(next),
        idempotent: true,
        ...(trackingSession ? { trackingSession } : {}),
      },
      200,
      origin,
    );
  }

  const applied = applyJourneyAction(record, action);
  if (!applied.ok) {
    return jsonResponse({ error: applied.error }, 409, origin);
  }

  let next = applied.job;
  if (session.authorized && session.role === "driver" && session.driverName && next.sharingActive) {
    next.activeDriverName = session.driverName;
  } else if (session.authorized && session.role === "owner" && next.sharingActive) {
    next.activeDriverName = next.activeDriverName ?? "Owner";
  }

  if (action === "complete_journey") {
    next = ensureReviewRequestScheduled(
      next,
      resolveReviewRequestDelayMs(env.REVIEW_REQUEST_DELAY_MINUTES),
    );
  }

  if (action === "arrived_pickup") {
    next = await sendArrivalNotificationIfNeeded(env, next, { forceRetry: forceRetryArrival });
  }

  if (action === "start_tracking") {
    next = await sendOnTheWayNotificationIfNeeded(env, next, {
      forceRetry: forceRetryOnTheWay,
    });
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

  const channels = arrivalChannelReport(env);

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
      arrivalNotificationStatus: next.arrivalNotificationStatus,
      arrivalNotificationSentAt: next.arrivalNotificationSentAt,
      arrivalNotificationProvider: next.arrivalNotificationProvider,
      arrivalNotificationError: next.arrivalNotificationError,
      onTheWayNotificationStatus: next.onTheWayNotificationStatus,
      onTheWayNotificationSentAt: next.onTheWayNotificationSentAt,
      onTheWayNotificationProvider: next.onTheWayNotificationProvider,
      onTheWayNotificationError: next.onTheWayNotificationError,
      arrivalChannels: channels,
      reviewRequest: buildReviewRequestSummary(next),
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

/**
 * Owner-only historical Journey Evidence pack (full GPS trail + booking/payment/timeline).
 * Read-only — does not mutate tracking or GPS history.
 * Lookup by tracking token and/or payment reference (same resolution pattern as diagnostic).
 * Customer tracking tokens must never unlock this endpoint (ownerAuthorized only).
 */
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
  const paymentReference = url.searchParams.get("paymentReference")?.trim() ?? "";
  if (!token && !paymentReference) {
    return jsonResponse({ error: "Missing paymentReference or token" }, 400, origin);
  }

  const store = env.TRACKING_STORE;
  let record: TrackingJobRecord | null = null;

  if (token) {
    record = await getTrackingJob(store, token);
  }

  if (!record && paymentReference) {
    const jobs = await findTrackingJobsByPaymentReference(store, paymentReference);
    record = jobs[0] ?? null;
  }

  let paid =
    paymentReference && paidBookingStoreConfigured(store)
      ? await getPaidBookingRecord(store, paymentReference)
      : null;

  if (!record && paid?.trackingToken?.trim()) {
    record = await getTrackingJob(store, paid.trackingToken.trim());
  }

  if (!record) {
    return jsonResponse(
      {
        error: "Tracking job not found for that booking.",
        paymentReference: paymentReference || null,
        paidBookingFound: Boolean(paid),
      },
      404,
      origin,
    );
  }

  if (!paid && record.paymentReference && paidBookingStoreConfigured(store)) {
    paid = await getPaidBookingRecord(store, record.paymentReference);
  }

  const points = await getDriverLocationHistory(store, record.token);
  const fields = pointFieldPresence(points);
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const recordedFrom = record.driverLocationRecordedFrom ?? firstPoint?.recordedAt;
  const recordedTo = record.driverLocationRecordedTo ?? lastPoint?.recordedAt;

  const started = record.trackingStartedAt ?? record.journeyStartedAt;
  const ended =
    record.journeyCompletedAt ?? record.arrivedDestinationAt ?? record.trackingStoppedAt;
  let durationMinutes: number | undefined;
  if (started && ended) {
    const ms = new Date(ended).getTime() - new Date(started).getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      durationMinutes = Math.round(ms / 60000);
    }
  }

  let gpsTrailDurationMinutes: number | undefined;
  if (recordedFrom && recordedTo) {
    const ms = new Date(recordedTo).getTime() - new Date(recordedFrom).getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      gpsTrailDurationMinutes = Math.round(ms / 60000);
    }
  }

  const routeReconstructable = points.length >= 2 && fields.hasLatLng;
  const paymentLinked = Boolean(paid?.paymentReference || record.paymentReference?.trim());
  const journeyCompleted = journeyStatusOf(record) === "completed";

  const bookingReference =
    paid?.paymentReference ?? record.paymentReference ?? record.token;

  return jsonResponse(
    {
      ok: true,
      readOnly: true,
      ownerOnly: true,
      customerSeesHistoricalRoute: false,
      evidence: {
        businessName: "My Airport Taxi NI",
        generatedAt: new Date().toISOString(),
        disclaimer:
          "Automatically generated journey record from the booking system. Intended as supporting operational evidence; it does not guarantee the outcome of any payment dispute.",
        integrityNotes: [
          "RECORDED FACTS come from stored booking, payment, journey-event, and GPS records.",
          "Derived values (for example duration) are calculated only from stored timestamps.",
          "GPS points were recorded by the driver's device associated with this booking session.",
          "This record does not prove the identity of any passenger in the vehicle.",
          "This record does not claim that a named customer was physically present unless a separate verifiable mechanism records that.",
          "Pickup and destination addresses are stored as text; they are not geocoded onto the map for evidence.",
          "Customers never receive this historical route — live tracking remains live-pin only.",
        ],
        summary: {
          journeyRecorded: points.length > 0,
          gpsPointCount: points.length,
          routeReconstructable,
          paymentLinked,
          journeyCompleted,
        },
        bookingReference,
        paymentReference: record.paymentReference ?? paid?.paymentReference,
        amountPaid: paid?.amountPaidLabel,
        amount: typeof paid?.amount === "number" ? paid.amount : undefined,
        currency: paid?.currency,
        paymentStatus: paid?.status ?? (record.paymentReference ? "confirmed" : undefined),
        paymentCreatedAt: paid?.createdAt,
        checkoutId: paid?.checkoutId,
        transactionId: paid?.transactionId,
        transactionCode: paid?.transactionCode,
        amountRefunded: typeof paid?.amountRefunded === "number" ? paid.amountRefunded : undefined,
        refundHistory: paid?.refundHistory,
        termsAcceptedAt: paid?.termsAcceptedAt,
        termsVersion: paid?.termsVersion,
        cancellationPolicyVersion: paid?.cancellationPolicyVersion,
        cancelledAt: paid?.cancelledAt,
        refundedAt: paid?.refundedAt,
        assignedDriverName: record.assignedDriverName,
        paymentAuthorisationWording:
          "Customer authorised card payment for the quoted fare for the booked transfer service, subject to the Terms & Conditions and cancellation policy version shown at checkout.",
        paymentLinkageStatus: paymentLinked
          ? "Payment reference linked to tracking session"
          : "Payment reference not linked",
        bookingCreatedAt: paid?.createdAt ?? record.createdAt,
        customerName: record.customerName || paid?.customerName || "",
        customerMobile: record.customerMobile || paid?.mobileNumber,
        customerEmail: record.customerEmail || paid?.customerEmail,
        pickupLabel: record.pickupLabel || paid?.pickupLabel || "",
        dropoffLabel: record.dropoffLabel || paid?.dropoffLabel || "",
        tripLabel: paid?.tripLabel,
        tripType: paid?.returnJourney
          ? "Return journey"
          : paid?.isAirportTrip
            ? "Airport transfer"
            : "One-way",
        tripDate: record.tripDate || paid?.tripDate || "",
        tripTime: record.tripTime || paid?.tripTime || "",
        pickupDisplay: formatLondonDateTime(record.pickupAt),
        flightNumber: record.flightNumber || paid?.flightNumber,
        vehicle: paid?.vehicle,
        journeyStatus: journeyStatusOf(record),
        journeyStatusLabel: customerJourneyLabel(record),
        trackingStartedAt: record.trackingStartedAt,
        arrivedPickupAt: record.arrivedPickupAt,
        journeyStartedAt: record.journeyStartedAt,
        arrivedDestinationAt: record.arrivedDestinationAt,
        journeyCompletedAt: record.journeyCompletedAt,
        trackingStoppedAt: record.trackingStoppedAt,
        durationMinutes,
        gpsTrailDurationMinutes,
        pointCount: points.length,
        recordedFrom,
        recordedTo,
        fieldsStored: {
          latitudeLongitude: fields.hasLatLng,
          accuracyMeters: fields.hasAccuracy,
          speedMps: fields.hasSpeed,
          headingDegrees: fields.hasHeading,
        },
        routeReconstructable,
        sessionId: record.token,
        trackUrl: buildPublicTrackUrl(record.token),
        timeline: [
          { id: "booking_created", label: "Booking created", at: paid?.createdAt ?? record.createdAt },
          { id: "payment_received", label: "Payment received", at: paid?.createdAt },
          { id: "tracking_started", label: "Tracking started", at: record.trackingStartedAt },
          { id: "arrived_pickup", label: "Driver arrived at pickup", at: record.arrivedPickupAt },
          {
            id: "journey_started",
            label: "Passenger journey started",
            at: record.journeyStartedAt,
          },
          {
            id: "arrived_destination",
            label: "Arrived destination",
            at: record.arrivedDestinationAt,
          },
          { id: "journey_completed", label: "Journey completed", at: record.journeyCompletedAt },
          { id: "tracking_stopped", label: "Tracking stopped", at: record.trackingStoppedAt },
        ],
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
  if (paid.status === "refunded" || paid.status === "cancelled") {
    return jsonResponse(
      { error: "Cannot create tracking for a cancelled or refunded booking" },
      400,
      origin,
    );
  }

  if (paid.trackingToken?.trim()) {
    const existing = await getTrackingJob(env.TRACKING_STORE, paid.trackingToken);
    // Still run createTrackingJobFromBooking below when return fields exist so a
    // missing return leg is created even if the outbound token is already set.
    if (existing && !(paid.returnJourney && paid.returnDate?.trim() && paid.returnTime?.trim())) {
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

  const beforeJobs = paid.paymentReference
    ? await findTrackingJobsByPaymentReference(env.TRACKING_STORE, paymentReference)
    : [];
  const hadReturnBefore = beforeJobs.some((job) => job.journeyLeg === "return");

  const record = await createTrackingJobFromBooking(
    env.TRACKING_STORE,
    booking,
    paymentReference,
  );
  if (!record) {
    return jsonResponse({ error: "Could not create tracking job for this booking" }, 502, origin);
  }

  const afterJobs = await findTrackingJobsByPaymentReference(env.TRACKING_STORE, paymentReference);
  const hasReturnAfter = afterJobs.some((job) => job.journeyLeg === "return");
  const returnLegCreated = Boolean(paid.returnJourney && !hadReturnBefore && hasReturnAfter);
  const alreadyExisted = beforeJobs.length > 0 && !returnLegCreated;

  await savePaidBookingRecord(env.TRACKING_STORE, {
    ...paid,
    trackingToken: record.token,
  });

  return jsonResponse(
    {
      ok: true,
      alreadyExisted,
      token: record.token,
      trackUrl: buildPublicTrackUrl(record.token),
      returnLegCreated,
      trackingJobCount: afterJobs.length,
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
    pathname === "/driver/journey/evidence" ||
    pathname === "/api/driver/journey/evidence" ||
    pathname === "/paid-bookings/journey-evidence" ||
    pathname === "/api/paid-bookings/journey-evidence"
  );
}

/** Owner-only read-only tracking diagnostic (by payment reference or job token). */
export function isJourneyDiagnosticPath(pathname: string): boolean {
  return (
    pathname === "/driver/journey/diagnostic" ||
    pathname === "/api/driver/journey/diagnostic" ||
    pathname === "/paid-bookings/tracking-diagnostic" ||
    pathname === "/api/paid-bookings/tracking-diagnostic"
  );
}

export function isEnsureTrackingPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/ensure-tracking" ||
    pathname === "/api/paid-bookings/ensure-tracking"
  );
}

function pointFieldPresence(points: DriverLocationPoint[]) {
  let hasLatLng = false;
  let hasAccuracy = false;
  let hasSpeed = false;
  let hasHeading = false;
  for (const point of points) {
    if (typeof point.lat === "number" && typeof point.lng === "number") {
      hasLatLng = true;
    }
    if (typeof point.accuracyMeters === "number" && Number.isFinite(point.accuracyMeters)) {
      hasAccuracy = true;
    }
    if (typeof point.speedMps === "number" && Number.isFinite(point.speedMps)) {
      hasSpeed = true;
    }
    if (typeof point.headingDegrees === "number" && Number.isFinite(point.headingDegrees)) {
      hasHeading = true;
    }
  }
  return { hasLatLng, hasAccuracy, hasSpeed, hasHeading };
}

function buildSessionDiagnostic(
  job: TrackingJobRecord,
  points: DriverLocationPoint[],
  options: {
    paymentReferenceQueried: string;
    paidBookingLinked: boolean;
    gpsHistoryTtlSeconds: number;
  },
) {
  const fields = pointFieldPresence(points);
  const first = points[0];
  const last = points.at(-1);
  return {
    sessionFound: true as const,
    sessionId: job.token,
    paymentReference: job.paymentReference ?? null,
    paymentReferenceLinked:
      options.paidBookingLinked ||
      Boolean(job.paymentReference?.trim()) ||
      job.paymentReference?.trim() === options.paymentReferenceQueried,
    gpsPointCount: points.length,
    firstPointAt: first?.recordedAt ?? job.driverLocationRecordedFrom ?? null,
    lastPointAt: last?.recordedAt ?? job.driverLocationRecordedTo ?? null,
    fieldsStored: {
      latitudeLongitude: fields.hasLatLng,
      accuracyMeters: fields.hasAccuracy,
      speedMps: fields.hasSpeed,
      headingDegrees: fields.hasHeading,
    },
    trackingStartedAt: job.trackingStartedAt ?? null,
    trackingStoppedAt: job.trackingStoppedAt ?? null,
    journeyEvents: {
      journeyStatus: journeyStatusOf(job),
      trackingStartedAt: job.trackingStartedAt ?? null,
      arrivedPickupAt: job.arrivedPickupAt ?? null,
      journeyStartedAt: job.journeyStartedAt ?? null,
      arrivedDestinationAt: job.arrivedDestinationAt ?? null,
      journeyCompletedAt: job.journeyCompletedAt ?? null,
      trackingStoppedAt: job.trackingStoppedAt ?? null,
      sharingActive: Boolean(job.sharingActive),
    },
    storage: {
      location: "cloudflare_kv",
      binding: "TRACKING_STORE",
      jobKeyPrefix: "track:job:",
      historyKeyPrefix: "track:driver-history:",
      paymentRefIndexPrefix: "track:ref:",
      durableObject: false,
      d1: false,
    },
    retention: {
      trackingJobTtlDays: Math.round(TRACKING_JOB_TTL_SECONDS / (60 * 60 * 24)),
      gpsHistoryTtlDays: Math.round(options.gpsHistoryTtlSeconds / (60 * 60 * 24)),
      gpsSessionTtlHours: Math.round(TRACKING_SESSION_TTL_SECONDS / (60 * 60)),
      note: "Read-only diagnostic. No journey data was modified.",
    },
    routeReconstructable: points.length >= 2 && fields.hasLatLng,
    customerSeesHistoricalRoute: false,
    customerPrivacy: {
      livePinOnly: true,
      historicalTrailExposed: false,
      historicalEvidenceOwnerOnly: true,
    },
  };
}

/**
 * Owner-only, read-only tracking diagnostic for a payment reference (or job token).
 * Uses server-side OWNER_ACCESS_KEY validation. Never returns secrets or full GPS trails.
 * Does not create, delete, or mutate tracking data.
 */
export async function handleTrackingDiagnosticRequest(
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
  const paymentReference = url.searchParams.get("paymentReference")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!paymentReference && !token) {
    return jsonResponse(
      { error: "Missing paymentReference or token" },
      400,
      origin,
    );
  }

  const store = env.TRACKING_STORE;
  const historyTtl = gpsHistoryTtlSeconds(env);

  let jobs: TrackingJobRecord[] = [];
  if (token) {
    const job = await getTrackingJob(store, token);
    if (job) {
      jobs = [job];
    }
  } else {
    jobs = await findTrackingJobsByPaymentReference(store, paymentReference);
  }

  const paid =
    paymentReference && paidBookingStoreConfigured(store)
      ? await getPaidBookingRecord(store, paymentReference)
      : jobs[0]?.paymentReference && paidBookingStoreConfigured(store)
        ? await getPaidBookingRecord(store, jobs[0].paymentReference)
        : null;

  // If paid booking has a trackingToken but ref index missed it, resolve that job too.
  if (jobs.length === 0 && paid?.trackingToken?.trim()) {
    const linked = await getTrackingJob(store, paid.trackingToken.trim());
    if (linked) {
      jobs = [linked];
    }
  }

  if (jobs.length === 0) {
    return jsonResponse(
      {
        ok: true,
        readOnly: true,
        paymentReference: paymentReference || null,
        sessionFound: false,
        sessions: [],
        paidBookingFound: Boolean(paid),
        paymentReferenceLinked: Boolean(paid),
        storage: {
          location: "cloudflare_kv",
          binding: "TRACKING_STORE",
          durableObject: false,
          d1: false,
        },
        retention: {
          trackingJobTtlDays: Math.round(TRACKING_JOB_TTL_SECONDS / (60 * 60 * 24)),
          gpsHistoryTtlDays: Math.round(historyTtl / (60 * 60 * 24)),
          gpsSessionTtlHours: Math.round(TRACKING_SESSION_TTL_SECONDS / (60 * 60)),
          note: "Read-only diagnostic. No journey data was modified.",
        },
        customerSeesHistoricalRoute: false,
        customerPrivacy: {
          livePinOnly: true,
          historicalTrailExposed: false,
          historicalEvidenceOwnerOnly: true,
        },
      },
      200,
      origin,
    );
  }

  const sessions = [];
  for (const job of jobs) {
    const points = await getDriverLocationHistory(store, job.token);
    sessions.push(
      buildSessionDiagnostic(job, points, {
        paymentReferenceQueried: paymentReference || job.paymentReference?.trim() || "",
        paidBookingLinked: Boolean(paid),
        gpsHistoryTtlSeconds: historyTtl,
      }),
    );
  }

  const primary = sessions[0];

  return jsonResponse(
    {
      ok: true,
      readOnly: true,
      // Flat primary fields for the single-job report format.
      ...primary,
      paymentReference: paymentReference || primary.paymentReference,
      paidBookingFound: Boolean(paid),
      sessionFound: true,
      sessionCount: sessions.length,
      sessions,
    },
    200,
    origin,
  );
}
