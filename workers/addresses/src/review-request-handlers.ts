import { buildGoogleReviewRequestEmail } from "../shared/booking-notifications";
import { resolveGoogleReviewUrl } from "../shared/business-links";
import { isReviewRequestDue, type TrackingJobRecord } from "../shared/tracking";
import {
  listTrackingJobsForRecentDays,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  GOOGLE_REVIEW_URL?: string;
};

export type ReviewRequestRunResult = {
  scanned: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
};

export async function processDueReviewRequests(env: Env): Promise<ReviewRequestRunResult> {
  const result: ReviewRequestRunResult = {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return result;
  }

  const reviewUrl = resolveGoogleReviewUrl(env.GOOGLE_REVIEW_URL);
  if (!reviewUrl) {
    console.warn("Google review URL is not configured — skipping review request emails");
    return result;
  }

  const jobs = await listTrackingJobsForRecentDays(env.TRACKING_STORE, 4);
  result.scanned = jobs.length;

  for (const job of jobs) {
    const outcome = await maybeSendReviewRequestEmail(env, job, reviewUrl);
    if (outcome === "sent") {
      result.sent += 1;
      result.eligible += 1;
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

async function maybeSendReviewRequestEmail(
  env: Env,
  job: TrackingJobRecord,
  reviewUrl: string,
): Promise<"not_eligible" | "eligible_skipped" | "sent" | "eligible_error"> {
  if (job.reviewRequestSentAt) {
    return "not_eligible";
  }

  if (!job.customerEmail?.trim()) {
    return "not_eligible";
  }

  if (!isReviewRequestDue(job.pickupAt)) {
    return "not_eligible";
  }

  const email = buildGoogleReviewRequestEmail(
    {
      customerName: job.customerName,
      pickupLabel: job.pickupLabel,
      dropoffLabel: job.dropoffLabel,
      tripDate: job.tripDate,
      tripTime: job.tripTime,
    },
    reviewUrl,
  );

  const sendResult = await trySendBrandedCustomerEmail(env, {
    to: job.customerEmail.trim(),
    toName: job.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (!sendResult.sent) {
    console.error("Review request email failed", sendResult.error, job.token);
    return "eligible_error";
  }

  job.reviewRequestSentAt = new Date().toISOString();
  await saveTrackingJob(env.TRACKING_STORE!, job);
  return "sent";
}
