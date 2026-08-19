import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  buildUpdatedBookingConfirmationEmail,
  type PaidBookingDetails,
  type PaidBookingReceipt,
} from "../shared/booking-notifications";
import { paidBookingRecordToReceipt } from "../shared/paid-booking-canonical";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import type { LogPaidBookingCalendarFn } from "./finalize-paid-checkout";
import {
  getPaidBookingRecord,
  listUpcomingPaidBookings,
  listRecentPaidBookings,
  paidBookingStoreConfigured,
  updatePaidBookingFields,
} from "./paid-booking-store";
import {
  PRIMARY_DRIVER_LABEL,
  resolveAssignedDriverLabel,
} from "../shared/paid-booking-record";
import { resolveOperationalStatus } from "../shared/refund-ops";
import {
  findTrackingJobByPaymentReference,
  findTrackingJobsByPaymentReference,
  getTrackingJob,
  listTrackingJobsForDateRange,
} from "./tracking-store";
import {
  buildPublicTrackUrl,
  journeyStatusOf,
  resolveEmailTrackUrl,
} from "../shared/tracking";
import type { TrackingJobRecord } from "../shared/tracking";
import { getPendingCheckout, pendingCheckoutStoreConfigured } from "./pending-checkout-store";
import {
  buildPendingCheckoutOwnerViews,
  recoverPaidButUnfinalizedCheckouts,
  recoverPaidCheckout,
} from "./recover-paid-checkouts";
import { buildReviewRequestSummary } from "./review-request-handlers";
import {
  trySendBrandedCustomerEmail,
  trySendOwnerOperationalEmail,
  type WorkerEmailEnv,
} from "./worker-email";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    SUMUP_API_KEY?: string;
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
    GOOGLE_CALENDAR_ID?: string;
  };

const BUSINESS_NAME = "My Airport Taxi NI";

function londonYmdNow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * Build a minimal paid-booking-shaped record from a tracking job when the
 * SumUp paid-booking KV row is missing (finalize gap) so Upcoming Jobs still lists it.
 */
function syntheticPaidBookingFromTrackingJob(job: TrackingJobRecord): PaidBookingRecord | null {
  const paymentReference = job.paymentReference?.trim();
  if (!paymentReference) return null;
  if (job.refundedAt) return null;

  return {
    paymentReference,
    checkoutId: "",
    amount: 0,
    currency: "GBP",
    amountPaidLabel: "",
    customerName: job.customerName || "Customer",
    customerEmail: job.customerEmail || "",
    mobileNumber: job.customerMobile || "",
    tripLabel: `${job.pickupLabel} → ${job.dropoffLabel}`,
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    returnJourney: false,
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    flightNumber: job.flightNumber,
    trackingToken: job.token,
    calendarEventIds: [],
    status: "confirmed",
    createdAt: job.createdAt,
  };
}

/**
 * Current secure customer track URL for a paid booking confirmation / resend.
 * Uses the booking's tracking token (or payment-ref lookup). Skips refunded /
 * missing jobs so expired or revoked tokens are never emailed.
 */
export async function resolvePaidBookingTrackUrl(
  store: KVNamespace,
  record: { trackingToken?: string; paymentReference?: string },
): Promise<string | undefined> {
  const token = record.trackingToken?.trim();
  let job: TrackingJobRecord | null = null;

  if (token) {
    job = await getTrackingJob(store, token);
  }

  if (!job && record.paymentReference?.trim()) {
    job = await findTrackingJobByPaymentReference(store, record.paymentReference.trim());
  }

  return resolveEmailTrackUrl(job);
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

function recordToDetails(record: PaidBookingRecord): PaidBookingDetails {
  return paidBookingRecordToReceipt(record);
}

function recordToReceipt(record: PaidBookingRecord): PaidBookingReceipt {
  return paidBookingRecordToReceipt(record);
}

export async function handlePaidBookingsListRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to list paid bookings." },
      401,
      origin,
    );
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  const store = env.TRACKING_STORE;
  const url = new URL(request.url);
  const mode = String(url.searchParams.get("mode") || "upcoming").trim().toLowerCase();
  const days = Number(url.searchParams.get("days") || "30");
  const limit = Number(url.searchParams.get("limit") || "100");
  const pastDays = Number(url.searchParams.get("pastDays") || "2");
  const futureDays = Number(url.searchParams.get("futureDays") || "90");

  // Upcoming Jobs default: journey/pickup date (not payment-created date).
  let bookings =
    mode === "recent" || mode === "created"
      ? await listRecentPaidBookings(store, { days, limit })
      : await listUpcomingPaidBookings(store, {
          pastDays: Number.isFinite(pastDays) ? pastDays : 2,
          futureDays: Number.isFinite(futureDays) ? futureDays : 90,
          limit: Number.isFinite(limit) ? limit : 100,
        });

  // Also merge tracking jobs in the journey-date window. Covers finalize gaps where a
  // live tracking job exists for e.g. 19 Aug but the paid-booking KV row is missing.
  if (mode !== "recent" && mode !== "created") {
    const today = londonYmdNow();
    const past = Number.isFinite(pastDays) ? pastDays : 2;
    const future = Number.isFinite(futureDays) ? futureDays : 90;
    const fromDate = addDaysYmd(today, -past);
    const toDate = addDaysYmd(today, future);
    const trackJobs = await listTrackingJobsForDateRange(store, fromDate, toDate);
    const byRef = new Map(bookings.map((b) => [b.paymentReference, b]));

    for (const job of trackJobs) {
      if (journeyStatusOf(job) === "completed") continue;
      if (job.refundedAt) continue;
      const paymentReference = job.paymentReference?.trim();
      if (!paymentReference || byRef.has(paymentReference)) continue;

      const paid = await getPaidBookingRecord(store, paymentReference);
      if (paid) {
        byRef.set(paymentReference, paid);
        continue;
      }

      // Return legs alone must not invent a synthetic outbound-shaped paid row.
      if (job.journeyLeg === "return") continue;

      const synthetic = syntheticPaidBookingFromTrackingJob(job);
      if (synthetic) byRef.set(paymentReference, synthetic);
    }

    bookings = [...byRef.values()]
      .sort((a, b) =>
        `${a.tripDate}T${a.tripTime}`.localeCompare(`${b.tripDate}T${b.tripTime}`),
      )
      .slice(0, Number.isFinite(limit) ? limit : 100);
  }

  const enriched = await Promise.all(
    bookings.map(async (booking) => {
      let sharingActive = false;
      let journeyStatus: string | undefined;
      let journeyCompletedAt: string | undefined;
      let driverUpdatedAt: string | undefined;
      let trackUrl: string | undefined;
      let reviewRequest: ReturnType<typeof buildReviewRequestSummary> | undefined;
      let assignedDriverName: string | undefined;
      let assignmentStatus: string | undefined;
      let arrivedPickupAt: string | undefined;
      let arrivalNotificationStatus: string | undefined;
      let arrivalNotificationSentAt: string | undefined;
      let arrivalNotificationProvider: string | undefined;
      let arrivalNotificationError: string | undefined;
      let passengers: number | undefined;
      let suitcases: number | undefined;
      let childSeats: number | undefined;
      let childSeatNotes: string | undefined;
      let notes: string | undefined;
      let flightNumber: string | undefined;
      let returnFlightNumber: string | undefined;
      let vehicle: string | undefined;
      let editHistory = booking.editHistory ?? [];
      let trackingToken = booking.trackingToken;

      passengers = booking.passengers;
      suitcases = booking.suitcases;
      childSeats = booking.childSeats;
      childSeatNotes = booking.childSeatNotes;
      notes = booking.notes;
      flightNumber = booking.flightNumber;
      returnFlightNumber = booking.returnFlightNumber;
      vehicle = booking.vehicle;

      const token = booking.trackingToken?.trim();
      let job = token ? await getTrackingJob(store, token) : null;
      let linkedJobs: TrackingJobRecord[] = [];
      if (booking.paymentReference?.trim()) {
        linkedJobs = await findTrackingJobsByPaymentReference(
          store,
          booking.paymentReference.trim(),
        );
        if (!job) {
          job =
            linkedJobs.find((entry) => entry.journeyLeg !== "return") ??
            linkedJobs[0] ??
            null;
        }
      }

      const outboundJob =
        linkedJobs.find((entry) => entry.journeyLeg === "outbound") ??
        linkedJobs.find((entry) => entry.journeyLeg !== "return") ??
        (!booking.returnJourney ? job : null);
      const returnJob = linkedJobs.find((entry) => entry.journeyLeg === "return") ?? null;

      const outboundJourneyStatus = outboundJob
        ? journeyStatusOf(outboundJob)
        : job && job.journeyLeg !== "return"
          ? journeyStatusOf(job)
          : undefined;
      const returnJourneyStatus = returnJob ? journeyStatusOf(returnJob) : undefined;

      const allLegsCompleted = booking.returnJourney
        ? outboundJourneyStatus === "completed" && returnJourneyStatus === "completed"
        : outboundJourneyStatus === "completed" ||
          (!outboundJob && job ? journeyStatusOf(job) === "completed" : false);

      // Active leg for dashboard controls: first unfinished leg (never skip past unfinished outbound).
      if (booking.returnJourney) {
        if (outboundJourneyStatus !== "completed" && outboundJob) {
          job = outboundJob;
        } else if (returnJourneyStatus !== "completed" && returnJob) {
          job = returnJob;
        } else if (returnJob) {
          job = returnJob;
        } else if (outboundJob) {
          job = outboundJob;
        }
      } else if (outboundJob) {
        job = outboundJob;
      }

      let nextUnfinishedLegDate = booking.tripDate;
      let nextUnfinishedLegTime = booking.tripTime;
      if (booking.returnJourney) {
        if (outboundJourneyStatus === "completed") {
          nextUnfinishedLegDate = booking.returnDate ?? booking.tripDate;
          nextUnfinishedLegTime = booking.returnTime ?? booking.tripTime;
        } else {
          nextUnfinishedLegDate = booking.tripDate;
          nextUnfinishedLegTime = booking.tripTime;
        }
      }

      if (job) {
        trackingToken = job.token;
        sharingActive = Boolean(job.sharingActive);
        journeyStatus = journeyStatusOf(job);
        journeyCompletedAt = job.journeyCompletedAt;
        driverUpdatedAt = job.driverUpdatedAt;
        trackUrl = buildPublicTrackUrl(job.token);
        reviewRequest = buildReviewRequestSummary(job);
        assignedDriverName = job.assignedDriverName;
        assignmentStatus = job.assignmentStatus;
        arrivedPickupAt = job.arrivedPickupAt;
        arrivalNotificationStatus = job.arrivalNotificationStatus;
        arrivalNotificationSentAt = job.arrivalNotificationSentAt;
        arrivalNotificationProvider = job.arrivalNotificationProvider;
        arrivalNotificationError = job.arrivalNotificationError;
        if (!flightNumber && job.flightNumber) flightNumber = job.flightNumber;
      }

      return {
        paymentReference: booking.paymentReference,
        checkoutId: booking.checkoutId,
        createdAt: booking.createdAt,
        status: booking.status,
        operationalStatus: booking.operationalStatus ?? resolveOperationalStatus(booking),
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaidLabel,
        amount: booking.amount,
        amountRefunded: booking.amountRefunded ?? 0,
        refundDueAmount: booking.refundDueAmount ?? 0,
        refundDueReason: booking.refundDueReason,
        originalAmount: booking.originalAmount,
        transactionId: booking.transactionId,
        refundHistory: booking.refundHistory,
        cancelledAt: booking.cancelledAt,
        refundedAt: booking.refundedAt,
        termsAcceptedAt: booking.termsAcceptedAt,
        termsVersion: booking.termsVersion,
        cancellationPolicyVersion: booking.cancellationPolicyVersion,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        mobileNumber: booking.mobileNumber,
        tripLabel: booking.tripLabel,
        pickupLabel: booking.pickupLabel,
        dropoffLabel: booking.dropoffLabel,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        returnJourney: booking.returnJourney,
        returnDate: booking.returnDate,
        returnTime: booking.returnTime,
        flightNumber,
        returnFlightNumber,
        passengers,
        suitcases,
        childSeats,
        childSeatNotes,
        notes,
        vehicle,
        trackingToken,
        sharingActive,
        journeyStatus,
        journeyCompletedAt,
        driverUpdatedAt,
        trackUrl,
        assignedDriverName,
        assignmentStatus,
        assignedDriverLabel: resolveAssignedDriverLabel(assignedDriverName),
        primaryDriverDefault: !assignedDriverName?.trim(),
        arrivedPickupAt,
        arrivalNotificationStatus,
        arrivalNotificationSentAt,
        arrivalNotificationProvider,
        arrivalNotificationError,
        outboundJourneyStatus,
        returnJourneyStatus,
        allLegsCompleted,
        nextUnfinishedLegDate,
        nextUnfinishedLegTime,
        editHistory,
        ...(reviewRequest ? { reviewRequest } : {}),
      };
    }),
  );

  return jsonResponse(
    {
      ok: true,
      count: enriched.length,
      mode: mode === "recent" || mode === "created" ? "recent" : "upcoming",
      primaryDriverLabel: PRIMARY_DRIVER_LABEL,
      bookings: enriched,
    },
    200,
    origin,
  );
}

export async function handlePaidBookingResendRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to resend confirmations." },
      401,
      origin,
    );
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  const latest = Boolean(body.latest);

  let record: PaidBookingRecord | null = null;
  if (paymentReference) {
    record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  } else if (latest) {
    const recent = await listRecentPaidBookings(env.TRACKING_STORE, { days: 14, limit: 1 });
    record = recent[0] ?? null;
  }

  if (!record) {
    return jsonResponse(
      {
        error: paymentReference
          ? `No paid booking found for ${paymentReference}`
          : "No recent paid booking found to resend.",
      },
      404,
      origin,
    );
  }

  if (record.status === "refunded" || record.status === "cancelled") {
    return jsonResponse(
      { error: "That booking was cancelled or refunded — confirmation not resent." },
      400,
      origin,
    );
  }

  const receipt = recordToReceipt(record);
  const trackUrl = await resolvePaidBookingTrackUrl(env.TRACKING_STORE, record);
  // Resend uses updated-confirmation template from the canonical record only
  // (never pending-checkout.booking — that snapshot is frozen at payment time).
  const customerEmail = buildUpdatedBookingConfirmationEmail(receipt, BUSINESS_NAME, {
    trackUrl,
    fareNote: "No change to your fare",
  });
  const ownerEmail = buildOwnerPaidBookingEmail(receipt, BUSINESS_NAME, {
    trackUrl,
  });

  const customerEmailResult = await trySendBrandedCustomerEmail(env, {
    to: record.customerEmail,
    toName: record.customerName,
    subject: customerEmail.subject,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  if (customerEmailResult.sent) {
    await updatePaidBookingFields(
      env.TRACKING_STORE,
      record.paymentReference,
      {
        lastUpdatedConfirmationSentAt: new Date().toISOString(),
        lastUpdatedConfirmationError: "",
      },
      { appendAudit: false },
    );
  } else {
    await updatePaidBookingFields(
      env.TRACKING_STORE,
      record.paymentReference,
      {
        lastUpdatedConfirmationError:
          customerEmailResult.error || "Updated confirmation email failed",
      },
      { appendAudit: false },
    );
  }

  const bookingsInbox =
    env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk";

  const ownerCopyResult = await trySendBrandedCustomerEmail(env, {
    to: bookingsInbox,
    toName: "Bookings",
    subject: `[Bookings copy] ${customerEmail.subject}`,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  const ownerEmailResult = await trySendOwnerOperationalEmail(env, {
    to: bookingsInbox,
    subject: `[Resent] ${ownerEmail.subject}`,
    body: `${ownerEmail.body}\n\n(This is a manual resend of the paid booking confirmation.)`,
  });
  const ownerNotifySent = ownerCopyResult.sent || ownerEmailResult.sent;

  return jsonResponse(
    {
      ok: customerEmailResult.sent,
      paymentReference: record.paymentReference,
      customerEmail: record.customerEmail,
      trackUrlIncluded: Boolean(trackUrl),
      ...(trackUrl ? { trackUrl } : {}),
      customerEmailSent: customerEmailResult.sent,
      customerEmailProvider: customerEmailResult.provider,
      customerEmailError: customerEmailResult.error,
      ownerEmailSent: ownerNotifySent,
      ownerEmailProvider: ownerCopyResult.provider || ownerEmailResult.provider,
      ownerEmailError: ownerNotifySent
        ? undefined
        : ownerCopyResult.error || ownerEmailResult.error,
      bookingsCopySent: ownerCopyResult.sent,
      tripLabel: record.tripLabel,
      amountPaid: record.amountPaidLabel,
      createdAt: record.createdAt,
      confirmationPickupLabel: receipt.pickupLabel,
      pickupLabel: record.pickupLabel,
      resendOnly: true,
      subject: customerEmail.subject,
    },
    customerEmailResult.sent ? 200 : 502,
    origin,
  );
}

export async function handlePendingCheckoutsListRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to list pending checkouts." },
      401,
      origin,
    );
  }

  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "40");
  const pending = await buildPendingCheckoutOwnerViews(env, { limit });

  return jsonResponse(
    {
      ok: true,
      count: pending.length,
      needsFinalizeCount: pending.filter((item) => item.needsFinalize).length,
      pending,
    },
    200,
    origin,
  );
}

/**
 * One-shot idempotent recovery for a PAID SumUp checkout that never finalized
 * (or for scanning recent pending checkouts). Does not create a new payment.
 */
export async function handleFinalizeCheckoutRequest(
  request: Request,
  env: Env,
  origin: string | null,
  logPaidBookingCalendar: LogPaidBookingCalendarFn,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      {
        error:
          "Unauthorized — use OWNER_ACCESS_KEY (or DRIVER_ACCESS_KEY) to recover a paid checkout.",
      },
      401,
      origin,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const checkoutId = String(body.checkoutId ?? "").trim();
  const preferTestOnePound = Boolean(body.preferTestOnePound ?? body.latestTest ?? true);
  const scan = Boolean(body.scan ?? !checkoutId);

  if (checkoutId) {
    const result = await recoverPaidCheckout({
      env,
      checkoutId,
      logPaidBookingCalendar,
    });
    const ok =
      result.action === "finalized" ||
      result.action === "already_finalized" ||
      result.action === "calendar_backfill";
    return jsonResponse(
      {
        ok,
        ...result,
      },
      ok ? 200 : result.action === "skipped" ? 402 : 502,
      origin,
    );
  }

  if (!scan) {
    return jsonResponse({ error: "Provide checkoutId or set scan: true." }, 400, origin);
  }

  const sweep = await recoverPaidButUnfinalizedCheckouts({
    env,
    logPaidBookingCalendar,
    preferTestOnePound,
    limit: Number(body.limit ?? 40),
  });

  return jsonResponse(
    {
      ok: sweep.ok,
      scanned: sweep.scanned,
      recovered: sweep.recovered,
      primary: sweep.primary,
      message: sweep.primary
        ? `Recovery ${sweep.primary.action} for ${sweep.primary.checkoutId}`
        : "No PAID-but-unfinalized pending checkouts found.",
    },
    sweep.ok || sweep.recovered.length === 0 ? 200 : 502,
    origin,
  );
}

export function isPaidBookingsListPath(pathname: string): boolean {
  return pathname === "/paid-bookings" || pathname === "/api/paid-bookings";
}

export function isPaidBookingResendPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/resend-confirmation" ||
    pathname === "/api/paid-bookings/resend-confirmation"
  );
}

export function isPaidBookingEditPath(pathname: string): boolean {
  return pathname === "/paid-bookings/edit" || pathname === "/api/paid-bookings/edit";
}

export function isPaidBookingUpdatedConfirmationPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/send-updated-confirmation" ||
    pathname === "/api/paid-bookings/send-updated-confirmation"
  );
}

export function isPendingCheckoutsListPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/pending" || pathname === "/api/paid-bookings/pending"
  );
}

export function isFinalizeCheckoutPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/finalize-checkout" ||
    pathname === "/api/paid-bookings/finalize-checkout"
  );
}
