import { buildGoogleReviewRequestEmail } from "../shared/booking-notifications";
import { resolveGoogleReviewUrl } from "../shared/business-links";
import { corsHeaders } from "../shared/google-places";
import {
  ensureReviewRequestScheduled,
  getReviewRequestStatus,
  isReviewRequestDue,
  journeyStatusOf,
  resolveReviewRequestDelayMs,
  type ReviewRequestStatus,
  type TrackingJobRecord,
} from "../shared/tracking";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  isTrackingJobCancelled,
  listTrackingJobsForRecentDays,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

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
  };
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

async function sendReviewRequestEmail(
  env: Env,
  job: TrackingJobRecord,
  reviewUrl: string,
): Promise<{ sent: boolean; error?: string }> {
  const customerEmail = job.customerEmail?.trim() ?? "";
  if (!customerEmail) {
    return { sent: false, error: "Customer email is missing" };
  }

  const email = buildGoogleReviewRequestEmail(
    {
      customerName: job.customerName,
    },
    reviewUrl,
  );

  const sendResult = await trySendBrandedCustomerEmail(env, {
    to: customerEmail,
    toName: job.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (!sendResult.sent) {
    return {
      sent: false,
      error: sendResult.error || "Review request email failed to send",
    };
  }

  return { sent: true };
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

  if (isTrackingJobCancelled(job) || job.refundedAt?.trim()) {
    return "not_eligible";
  }

  if (journeyStatusOf(job) !== "completed") {
    return "not_eligible";
  }

  if (!job.customerEmail?.trim()) {
    return "not_eligible";
  }

  let current = job;
  const beforeScheduled = Boolean(current.reviewRequestScheduledAt?.trim());
  current = ensureReviewRequestScheduled(current, delayMs);
  if (!beforeScheduled && current.reviewRequestScheduledAt) {
    await saveTrackingJob(env.TRACKING_STORE!, current);
    // Fall through — may already be due if delay is 0 or completion was earlier.
  }

  if (!isReviewRequestDue(current, delayMs)) {
    return beforeScheduled ? "not_eligible" : "scheduled";
  }

  const sendResult = await sendReviewRequestEmail(env, current, reviewUrl);
  if (!sendResult.sent) {
    current.reviewRequestFailedAt = new Date().toISOString();
    current.reviewRequestLastError = sendResult.error;
    await saveTrackingJob(env.TRACKING_STORE!, current);
    console.error("Review request email failed", sendResult.error, current.token);
    return "eligible_error";
  }

  current.reviewRequestSentAt = new Date().toISOString();
  delete current.reviewRequestFailedAt;
  delete current.reviewRequestLastError;
  await saveTrackingJob(env.TRACKING_STORE!, current);
  return "sent";
}

/**
 * Owner manual send / explicit resend.
 * Default: refuses if already sent. forceResend=true allows a deliberate duplicate.
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

  if (isTrackingJobCancelled(job) || job.refundedAt?.trim()) {
    return jsonResponse(
      { error: "This booking was cancelled or refunded — review request not sent." },
      400,
      origin,
    );
  }

  if (journeyStatusOf(job) !== "completed") {
    return jsonResponse(
      {
        error: "Journey is not completed yet. Mark the journey completed before sending a review request.",
        reviewRequest: buildReviewRequestSummary(job),
      },
      409,
      origin,
    );
  }

  if (job.reviewRequestSentAt?.trim() && !forceResend) {
    return jsonResponse(
      {
        ok: false,
        alreadySent: true,
        error:
          "A Google review request was already sent for this journey. Use Resend review request if you intentionally want another copy.",
        reviewRequest: buildReviewRequestSummary(job),
      },
      409,
      origin,
    );
  }

  const reviewUrl = resolveGoogleReviewUrl(env.GOOGLE_REVIEW_URL);
  if (!reviewUrl) {
    return jsonResponse({ error: "GOOGLE_REVIEW_URL is not configured." }, 503, origin);
  }

  const delayMs = delayMsFromEnv(env);
  let current = ensureReviewRequestScheduled(job, delayMs);

  const sendResult = await sendReviewRequestEmail(env, current, reviewUrl);
  if (!sendResult.sent) {
    current.reviewRequestFailedAt = new Date().toISOString();
    current.reviewRequestLastError = sendResult.error;
    // Keep journey completed — only review status changes.
    await saveTrackingJob(env.TRACKING_STORE, current);
    return jsonResponse(
      {
        ok: false,
        error: sendResult.error || "Failed to send review request email",
        reviewRequest: buildReviewRequestSummary(current),
      },
      502,
      origin,
    );
  }

  current.reviewRequestSentAt = new Date().toISOString();
  delete current.reviewRequestFailedAt;
  delete current.reviewRequestLastError;
  await saveTrackingJob(env.TRACKING_STORE, current);

  return jsonResponse(
    {
      ok: true,
      resent: forceResend,
      customerEmail: current.customerEmail,
      reviewRequest: buildReviewRequestSummary(current),
    },
    200,
    origin,
  );
}
