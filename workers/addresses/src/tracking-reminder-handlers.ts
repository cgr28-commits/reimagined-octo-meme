import { buildTrackingReminderEmail } from "../shared/booking-notifications";
import {
  evaluateTrackingAvailableReminder,
  resolveEmailTrackUrl,
  type TrackingJobRecord,
} from "../shared/tracking";
import {
  listTrackingJobsForRecentDays,
  listUpcomingTrackingJobs,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
};

export type TrackingReminderRunResult = {
  scanned: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
};

function dedupeJobsByToken(jobs: TrackingJobRecord[]): TrackingJobRecord[] {
  const seen = new Set<string>();
  const unique: TrackingJobRecord[] = [];
  for (const job of jobs) {
    const token = job.token?.trim();
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    unique.push(job);
  }
  return unique;
}

export async function processDueTrackingAvailableReminders(
  env: Env,
): Promise<TrackingReminderRunResult> {
  // Customer website live-tracking reminders are retired.
  // Driver on the way / Arrived emails cover travel-day customer updates instead.
  void env;
  return {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
  };
}

/** Retained for offline tests / possible future restore — not called by cron. */
export async function processDueTrackingAvailableRemindersLegacy(
  env: Env,
): Promise<TrackingReminderRunResult> {
  const result: TrackingReminderRunResult = {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return result;
  }

  const jobs = dedupeJobsByToken([
    ...(await listTrackingJobsForRecentDays(env.TRACKING_STORE, 1)),
    ...(await listUpcomingTrackingJobs(env.TRACKING_STORE, 2)),
  ]);
  result.scanned = jobs.length;

  for (const job of jobs) {
    const outcome = await maybeSendTrackingAvailableReminder(env, job);
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

async function maybeSendTrackingAvailableReminder(
  env: Env,
  job: TrackingJobRecord,
): Promise<"not_eligible" | "eligible_skipped" | "sent" | "eligible_error"> {
  if (evaluateTrackingAvailableReminder(job) !== "eligible") {
    return "not_eligible";
  }

  const trackUrl = resolveEmailTrackUrl(job);
  if (!trackUrl) {
    return "not_eligible";
  }

  const email = buildTrackingReminderEmail(
    {
      customerName: job.customerName,
      pickupLabel: job.pickupLabel,
      dropoffLabel: job.dropoffLabel,
      tripDate: job.tripDate,
      tripTime: job.tripTime,
      bookingReference: job.paymentReference,
    },
    trackUrl,
  );

  const sendResult = await trySendBrandedCustomerEmail(env, {
    to: job.customerEmail!.trim(),
    toName: job.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });

  if (!sendResult.sent) {
    console.error("Tracking available reminder email failed", sendResult.error, job.token);
    return "eligible_error";
  }

  job.sharingReminderSentAt = new Date().toISOString();
  await saveTrackingJob(env.TRACKING_STORE!, job);
  return "sent";
}
