import { buildGoogleReviewRequestEmail } from "../shared/booking-notifications";
import { resolveGoogleReviewUrl } from "../shared/business-links";
import { corsHeaders } from "../shared/google-places";
import {
  clearUnsentReviewRequest,
  ensureReviewRequestScheduled,
  getReviewRequestStatus,
  isReviewRequestDue,
  resolveReviewRequestDelayMs,
  reviewRequestSendRefusal,
  type ReviewRequestStatus,
  type TrackingJobRecord,
} from "../shared/tracking";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  listTrackingJobsForRecentDays,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    GOOGLE_REVIEW_URL?: string;
    REVIEW_REQUEST_DELAY_MINUTES?: string;
  };

export type ReviewRequestRunResult = {
  scanned: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
  scheduled: number;
};

export type ReviewRequestSummary = {
  status: ReviewRequestStatus;
  scheduledAt?: string;
  dueAt?: string;
  sentAt?: string;
  failedAt?: string;
  lastError?: string;
  /** Present after a successful review email. False means the owner copy was not included. */
  ownerBccSent?: boolean;
};

type ReviewEmailSendResult = {
  sent: boolean;
  error?: string;
  provider?: string;
  resendId?: string;
  customerEmail?: string;
  customerName?: string;
  customerEmailSent?: boolean;
  ownerBccSent?: boolean;
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

function delayMsFromEnv(env: Env): number {
  return resolveReviewRequestDelayMs(env.REVIEW_REQUEST_DELAY_MINUTES);
}

export function buildReviewRequestSummary(job: TrackingJobRecord): ReviewRequestSummary {
  return {
    status: getReviewRequestStatus(job),
    ...(job.reviewRequestScheduledAt ? { scheduledAt: job.reviewRequestScheduledAt } : {}),
    ...(job.reviewRequestDueAt ? { dueAt: job.reviewRequestDueAt } : {}),
    ...(job.reviewRequestSentAt ? { sentAt: job.reviewRequestSentAt } : {}),
    ...(job.reviewRequestFailedAt ? { failedAt: job.reviewRequestFailedAt } : {}),
    ...(job.reviewRequestLastError ? { lastError: job.reviewRequestLastError } : {}),
    ...(typeof job.reviewRequestOwnerBccSent === "boolean"
      ? { ownerBccSent: job.reviewRequestOwnerBccSent }
      : {}),
  };
}

/**
 * A cancelled paid booking, or the cancelled leg of a return, must not receive
 * a Google review request. A refund that leaves the journey confirmed does not
 * block it.
 */
export function paidBookingCancelsReviewRequest(
  booking: {
    operationalStatus?: string | null;
    status?: string | null;
    cancelledLegs?: Array<"outbound" | "return"> | null;
    outboundCancelledAt?: string | null;
    returnCancelledAt?: string | null;
  } | null | undefined,
  journeyLeg?: "outbound" | "return" | null,
): boolean {
  if (!booking) return false;
  if (booking.operationalStatus === "cancelled" || booking.status === "cancelled") return true;
  if (journeyLeg === "return") {
    return Boolean(booking.returnCancelledAt?.trim() || booking.cancelledLegs?.includes("return"));
  }
  if (journeyLeg === "outbound") {
    return Boolean(
      booking.outboundCancelledAt?.trim() || booking.cancelledLegs?.includes("outbound"),
    );
  }
  return false;
}

export type ReviewRequestGateReason = "ok" | "missing" | "already_sent" | "not_completed" | "cancelled";

export type ReviewRequestGate = {
  action: "send" | "skip";
  reason: ReviewRequestGateReason;
  job: TrackingJobRecord | null;
};

/**
 * Reload the stored journey immediately before a review email can be sent.
 * A stale in-memory copy from the cron scan is not enough: Cancel or Reopen
 * may have landed after that scan. Pending unsent review fields are removed
 * when the live record is cancelled or no longer completed. A sent audit is
 * never rewritten.
 */
export async function reloadReviewRequestEligibility(
  store: KVNamespace,
  token: string,
  options?: { allowAlreadySent?: boolean },
): Promise<ReviewRequestGate> {
  const job = await getTrackingJob(store, token);
  if (!job) return { action: "skip", reason: "missing", job: null };

  const paymentReference = job.paymentReference?.trim() ?? "";
  let bookingCancelled = false;
  if (paymentReference && paidBookingStoreConfigured(store)) {
    const paid = await getPaidBookingRecord(store, paymentReference);
    bookingCancelled = paidBookingCancelsReviewRequest(paid, job.journeyLeg);
  }

  const refusal = bookingCancelled ? "cancelled" : reviewRequestSendRefusal(job);
  if (!refusal) return { action: "send", reason: "ok", job };
  if (refusal === "already_sent" && options?.allowAlreadySent) {
    return { action: "send", reason: "ok", job };
  }
  if (refusal === "cancelled" || refusal === "not_completed") {
    const cleared = clearUnsentReviewRequest(job);
    if (cleared !== job) await saveTrackingJob(store, cleared);
    return { action: "skip", reason: refusal, job: cleared };
  }
  return { action: "skip", reason: "already_sent", job };
}

export function isReviewRequestSendPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/review-request" ||
    pathname === "/api/paid-bookings/review-request"
  );
}

async function resolveJobForOwnerSend(
  store: KVNamespace,
  body: Record<string, unknown>,
): Promise<TrackingJobRecord | null> {
  const token = String(body.token ?? "").trim();
  if (token) {
    return getTrackingJob(store, token);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  if (paymentReference) {
    return findTrackingJobByPaymentReference(store, paymentReference);
  }

  return null;
}

/**
 * Prefer the tracking job email; fall back to the paid booking record.
 * When the paid booking supplies the address, backfill it onto the job for future cron runs.
 */
export async function resolveReviewRequestRecipient(
  store: KVNamespace,
  job: TrackingJobRecord,
): Promise<{
  email: string;
  name: string;
  source: "tracking" | "paid_booking";
  job: TrackingJobRecord;
} | null> {
  const fromJob = job.customerEmail?.trim() ?? "";
  if (fromJob) {
    return {
      email: fromJob,
      name: job.customerName?.trim() || fromJob,
      source: "tracking",
      job,
    };
  }

  const paymentReference = job.paymentReference?.trim() ?? "";
  if (!paymentReference) {
    return null;
  }

  const paid = await getPaidBookingRecord(store, paymentReference);
  const fromPaid = paid?.customerEmail?.trim() ?? "";
  if (!fromPaid) {
    return null;
  }

  const name = paid?.customerName?.trim() || job.customerName?.trim() || fromPaid;
  const patched: TrackingJobRecord = {
    ...job,
    customerEmail: fromPaid,
    ...(job.customerName?.trim() ? {} : { customerName: name }),
  };

  return {
    email: fromPaid,
    name,
    source: "paid_booking",
    job: patched,
  };
}

async function sendReviewRequestEmail(
  env: Env,
  job: TrackingJobRecord,
  reviewUrl: string,
  recipient: { email: string; name: string },
): Promise<ReviewEmailSendResult> {
  const customerEmail = recipient.email.trim();
  if (!customerEmail) {
    return { sent: false, error: "Customer email is missing" };
  }

  const email = buildGoogleReviewRequestEmail(
    {
      customerName: recipient.name,
    },
    reviewUrl,
  );

  const sendResult = await trySendResendOnlyCustomerEmail(env, {
    to: customerEmail,
    toName: recipient.name,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (!sendResult.sent || sendResult.provider !== "resend") {
    return {
      sent: false,
      customerEmailSent: false,
      ownerBccSent: false,
      error: sendResult.error || "Review request email failed via Resend",
      provider: sendResult.provider,
      customerEmail,
      customerName: recipient.name,
    };
  }

  const ownerBccSent = sendResult.ownerBcc === true;
  const logDetail = {
    paymentReference: job.paymentReference ?? null,
    resendId: sendResult.resendId ?? null,
    customerEmailSent: true,
    ownerBccSent,
  };
  if (ownerBccSent) {
    console.info("Review request email accepted with owner BCC", logDetail);
  } else {
    console.warn(
      "Review request customer email was sent. Owner BCC copy was not sent.",
      logDetail,
    );
  }

  return {
    sent: true,
    provider: "resend",
    ...(sendResult.resendId ? { resendId: sendResult.resendId } : {}),
    customerEmail,
    customerName: recipient.name,
    customerEmailSent: true,
    ownerBccSent,
  };
}

export async function processDueReviewRequests(env: Env): Promise<ReviewRequestRunResult> {
  const result: ReviewRequestRunResult = {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    scheduled: 0,
  };

  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return result;
  }

  const reviewUrl = resolveGoogleReviewUrl(env.GOOGLE_REVIEW_URL);
  if (!reviewUrl) {
    console.warn("Google review URL is not configured — skipping review request emails");
    return result;
  }

  const delayMs = delayMsFromEnv(env);
  const jobs = await listTrackingJobsForRecentDays(env.TRACKING_STORE, 7);
  result.scanned = jobs.length;

  for (const job of jobs) {
    const outcome = await maybeProcessReviewRequest(env, job, reviewUrl, delayMs);
    if (outcome === "sent") {
      result.sent += 1;
      result.eligible += 1;
    } else if (outcome === "scheduled") {
      result.scheduled += 1;
    } else if (outcome === "eligible_error") {
      result.eligible += 1;
      result.errors += 1;
    } else if (outcome === "eligible_skipped") {
      result.eligible += 1;
      result.skipped += 1;
    }
  }

  return result;
}

async function maybeProcessReviewRequest(
  env: Env,
  job: TrackingJobRecord,
  reviewUrl: string,
  delayMs: number,
): Promise<"not_eligible" | "scheduled" | "eligible_skipped" | "sent" | "eligible_error"> {
  if (job.reviewRequestSentAt?.trim()) {
    return "not_eligible";
  }

  const opened = await reloadReviewRequestEligibility(env.TRACKING_STORE!, job.token);
  if (opened.action === "skip" || !opened.job) {
    return "not_eligible";
  }

  let current = opened.job;
  const beforeScheduled = Boolean(current.reviewRequestScheduledAt?.trim());
  current = ensureReviewRequestScheduled(current, delayMs);
  if (!beforeScheduled && current.reviewRequestScheduledAt) {
    await saveTrackingJob(env.TRACKING_STORE!, current);
    // Fall through — may already be due if delay is 0 or completion was earlier.
  }

  if (!isReviewRequestDue(current, delayMs)) {
    return beforeScheduled ? "not_eligible" : "scheduled";
  }

  const recipient = await resolveReviewRequestRecipient(env.TRACKING_STORE!, current);
  // Send-time check. Cancel or Reopen after the scan must still stop the email.
  const fresh = await reloadReviewRequestEligibility(env.TRACKING_STORE!, current.token);
  if (fresh.action === "skip" || !fresh.job || !isReviewRequestDue(fresh.job, delayMs)) {
    return "not_eligible";
  }
  current = fresh.job;

  if (!recipient) {
    current.reviewRequestFailedAt = new Date().toISOString();
    current.reviewRequestLastError =
      "Customer email is missing on tracking job and paid booking";
    // Keep reviewRequestDueAt so a later retry / manual send can still run after email is fixed.
    await saveTrackingJob(env.TRACKING_STORE!, current);
    return "eligible_error";
  }

  current = {
    ...current,
    ...(current.customerEmail?.trim() ? {} : { customerEmail: recipient.job.customerEmail }),
    ...(current.customerName?.trim() ? {} : { customerName: recipient.job.customerName }),
  };
  const sendResult = await sendReviewRequestEmail(env, current, reviewUrl, recipient);
  if (!sendResult.sent) {
    current.reviewRequestFailedAt = new Date().toISOString();
    current.reviewRequestLastError = sendResult.error;
    await saveTrackingJob(env.TRACKING_STORE!, current);
    console.error("Review request email failed", sendResult.error, current.token);
    return "eligible_error";
  }

  current.reviewRequestSentAt = new Date().toISOString();
  current.reviewRequestOwnerBccSent = sendResult.ownerBccSent === true;
  delete current.reviewRequestFailedAt;
  delete current.reviewRequestLastError;
  await saveTrackingJob(env.TRACKING_STORE!, current);
  return "sent";
}

/**
 * Owner manual send / explicit resend.
 * Default: refuses if already sent. forceResend=true allows a deliberate duplicate.
 * Success only when Resend accepts the message (provider=resend).
 */
export async function handleReviewRequestSendRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to send review requests." },
      401,
      origin,
    );
  }

  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Tracking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const forceResend = Boolean(body.forceResend);
  const job = await resolveJobForOwnerSend(env.TRACKING_STORE, body);
  if (!job) {
    return jsonResponse(
      { error: "Tracking job not found for that booking. Complete a journey first." },
      404,
      origin,
    );
  }

  const gated = await reloadReviewRequestEligibility(env.TRACKING_STORE, job.token, {
    allowAlreadySent: forceResend,
  });
  if (gated.action === "skip" || !gated.job) {
    if (gated.reason === "cancelled") {
      return jsonResponse(
        { error: "This booking was cancelled or refunded — review request not sent." },
        400,
        origin,
      );
    }
    if (gated.reason === "already_sent") {
      return jsonResponse(
        {
          ok: false,
          alreadySent: true,
          error:
            "A Google review email was already sent for this journey. Use Resend Email Review Request if you intentionally want another email copy.",
          reviewRequest: buildReviewRequestSummary(gated.job ?? job),
        },
        409,
        origin,
      );
    }
    return jsonResponse(
      {
        error: "Journey is not completed yet. Mark the journey completed before sending a review request.",
        reviewRequest: buildReviewRequestSummary(gated.job ?? job),
      },
      gated.reason === "missing" ? 404 : 409,
      origin,
    );
  }

  const reviewUrl = resolveGoogleReviewUrl(env.GOOGLE_REVIEW_URL);
  if (!reviewUrl) {
    return jsonResponse({ error: "GOOGLE_REVIEW_URL is not configured." }, 503, origin);
  }

  const delayMs = delayMsFromEnv(env);
  let current = ensureReviewRequestScheduled(gated.job, delayMs);

  const recipient = await resolveReviewRequestRecipient(env.TRACKING_STORE, current);
  if (!recipient) {
    current.reviewRequestFailedAt = new Date().toISOString();
    current.reviewRequestLastError =
      "Customer email is missing on tracking job and paid booking";
    // Keep reviewRequestDueAt — auto schedule remains until a successful send.
    await saveTrackingJob(env.TRACKING_STORE, current);
    return jsonResponse(
      {
        ok: false,
        error: current.reviewRequestLastError,
        reviewRequest: buildReviewRequestSummary(current),
      },
      502,
      origin,
    );
  }

  const fresh = await reloadReviewRequestEligibility(env.TRACKING_STORE, current.token, {
    allowAlreadySent: forceResend,
  });
  if (fresh.action === "skip" || !fresh.job) {
    if (fresh.reason === "cancelled") {
      return jsonResponse(
        { error: "This booking was cancelled or refunded — review request not sent." },
        400,
        origin,
      );
    }
    if (fresh.reason === "already_sent") {
      return jsonResponse(
        {
          ok: false,
          alreadySent: true,
          error:
            "A Google review email was already sent for this journey. Use Resend Email Review Request if you intentionally want another email copy.",
          reviewRequest: buildReviewRequestSummary(fresh.job ?? current),
        },
        409,
        origin,
      );
    }
    return jsonResponse(
      {
        error: "Journey is not completed yet. Mark the journey completed before sending a review request.",
        reviewRequest: buildReviewRequestSummary(fresh.job ?? current),
      },
      fresh.reason === "missing" ? 404 : 409,
      origin,
    );
  }
  current = {
    ...fresh.job,
    ...(fresh.job.customerEmail?.trim() ? {} : { customerEmail: recipient.job.customerEmail }),
    ...(fresh.job.customerName?.trim() ? {} : { customerName: recipient.job.customerName }),
  };
  const sendResult = await sendReviewRequestEmail(env, current, reviewUrl, recipient);
  if (!sendResult.sent) {
    current.reviewRequestFailedAt = new Date().toISOString();
    current.reviewRequestLastError = sendResult.error;
    // Keep journey completed and reviewRequestDueAt — only review status changes.
    await saveTrackingJob(env.TRACKING_STORE, current);
    return jsonResponse(
      {
        ok: false,
        error: sendResult.error || "Failed to send review request email via Resend",
        provider: sendResult.provider ?? "resend",
        reviewRequest: buildReviewRequestSummary(current),
      },
      502,
      origin,
    );
  }

  current.reviewRequestSentAt = new Date().toISOString();
  current.reviewRequestOwnerBccSent = sendResult.ownerBccSent === true;
  delete current.reviewRequestFailedAt;
  delete current.reviewRequestLastError;
  await saveTrackingJob(env.TRACKING_STORE, current);

  return jsonResponse(
    {
      ok: true,
      resent: forceResend,
      provider: "resend",
      ...(sendResult.resendId ? { resendId: sendResult.resendId } : {}),
      customerEmail: sendResult.customerEmail ?? current.customerEmail,
      customerEmailSent: true,
      ownerBccSent: sendResult.ownerBccSent === true,
      emailSource: recipient.source,
      reviewRequest: buildReviewRequestSummary(current),
    },
    200,
    origin,
  );
}
