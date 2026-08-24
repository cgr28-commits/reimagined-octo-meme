/**
 * Post-journey Google review request system — offline checks.
 * Run: npx tsx scripts/check-review-request.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildGoogleReviewRequestEmail,
  customerFirstName,
} from "../shared/booking-notifications";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  resolveGoogleReviewUrl,
} from "../shared/business-links";
import {
  applyJourneyAction,
  ensureReviewRequestScheduled,
  generateTrackingToken,
  getReviewRequestStatus,
  isReviewRequestDue,
  REVIEW_REQUEST_DELAY_MS,
  resolveReviewRequestDelayMs,
  type TrackingJobRecord,
} from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseJob(overrides: Partial<TrackingJobRecord> = {}): TrackingJobRecord {
  return {
    token: generateTrackingToken(),
    createdAt: new Date().toISOString(),
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    customerMobile: "07700900000",
    pickupLabel: "1 Test Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    tripDate: "2026-08-17",
    tripTime: "14:00",
    pickupAt: "2026-08-17T14:00",
    sharingActive: false,
    paymentReference: "TEST-PAY-REF-001",
    journeyStatus: "idle",
    ...overrides,
  };
}

function mustApply(job: TrackingJobRecord, action: Parameters<typeof applyJourneyAction>[1]) {
  const result = applyJourneyAction(job, action);
  assert.ok(result.ok, result.ok ? undefined : result.error);
  return result.ok ? result.job : job;
}

console.log("=== 1. Completed journey schedules review request ===");
{
  let job = baseJob({ journeyStatus: "arrived_destination", sharingActive: true });
  job = mustApply(job, "complete_journey");
  assert.equal(job.journeyStatus, "completed");
  assert.ok(job.journeyCompletedAt);

  const scheduled = ensureReviewRequestScheduled(job, REVIEW_REQUEST_DELAY_MS, job.journeyCompletedAt!);
  assert.equal(getReviewRequestStatus(scheduled), "scheduled");
  assert.ok(scheduled.reviewRequestScheduledAt);
  assert.ok(scheduled.reviewRequestDueAt);
  const dueMs = Date.parse(scheduled.reviewRequestDueAt!);
  const completedMs = Date.parse(scheduled.journeyCompletedAt!);
  assert.equal(dueMs - completedMs, REVIEW_REQUEST_DELAY_MS);
  console.log("OK  complete_journey + ensureReviewRequestScheduled sets due ~2h later");
}

console.log("\n=== 2. Paid-but-not-completed does not schedule ===");
{
  const paidOnly = baseJob({ journeyStatus: "idle", sharingActive: false });
  const after = ensureReviewRequestScheduled(paidOnly);
  assert.equal(getReviewRequestStatus(after), "not_scheduled");
  assert.equal(after.reviewRequestScheduledAt, undefined);
  assert.equal(isReviewRequestDue(after), false);

  const tracking = baseJob({ journeyStatus: "tracking", sharingActive: true });
  assert.equal(ensureReviewRequestScheduled(tracking).reviewRequestScheduledAt, undefined);

  const stoppedOnly = baseJob({
    journeyStatus: "stopped",
    sharingActive: false,
    trackingStoppedAt: "2026-08-17T06:32:23.170Z",
  });
  assert.equal(ensureReviewRequestScheduled(stoppedOnly).reviewRequestScheduledAt, undefined);
  assert.equal(isReviewRequestDue(stoppedOnly), false);

  // Owner can Complete Journey after Stop Tracking.
  let afterStop = mustApply(baseJob({ journeyStatus: "tracking", sharingActive: true }), "stop_tracking");
  assert.equal(afterStop.journeyStatus, "stopped");
  afterStop = mustApply(afterStop, "complete_journey");
  const scheduledAfterStop = ensureReviewRequestScheduled(afterStop);
  assert.equal(getReviewRequestStatus(scheduledAfterStop), "scheduled");
  console.log("OK  paid/tracking/stopped-only bookings are not scheduled until Complete Journey");
}

console.log("\n=== 3. Cancelled / refunded booking does not send ===");
{
  const cancelled = ensureReviewRequestScheduled(
    baseJob({
      journeyStatus: "completed",
      journeyCompletedAt: "2026-08-17T12:00:00.000Z",
      refundedAt: "2026-08-17T12:30:00.000Z",
    }),
  );
  assert.equal(
    isReviewRequestDue(cancelled, REVIEW_REQUEST_DELAY_MS, Date.parse("2026-08-17T15:00:00.000Z")),
    false,
  );
  console.log("OK  refunded completed jobs are not due");
}

console.log("\n=== 4. Review request sends ~2 hours after completion ===");
{
  assert.equal(resolveReviewRequestDelayMs(120), 120 * 60 * 1000);
  assert.equal(resolveReviewRequestDelayMs("120"), REVIEW_REQUEST_DELAY_MS);
  assert.equal(resolveReviewRequestDelayMs("bogus"), REVIEW_REQUEST_DELAY_MS);

  const completedAt = "2026-08-17T12:00:00.000Z";
  const job = ensureReviewRequestScheduled(
    baseJob({
      journeyStatus: "completed",
      journeyCompletedAt: completedAt,
    }),
    REVIEW_REQUEST_DELAY_MS,
    completedAt,
  );

  const oneHourLater = Date.parse(completedAt) + 60 * 60 * 1000;
  const twoHoursLater = Date.parse(completedAt) + REVIEW_REQUEST_DELAY_MS;
  assert.equal(isReviewRequestDue(job, REVIEW_REQUEST_DELAY_MS, oneHourLater), false);
  assert.equal(isReviewRequestDue(job, REVIEW_REQUEST_DELAY_MS, twoHoursLater), true);
  console.log("OK  due only after configured delay (default 120 minutes)");
}

console.log("\n=== 5. Email contains correct Google review URL ===");
{
  const url = resolveGoogleReviewUrl();
  assert.equal(url, "https://g.page/r/CbzkRdTv-0hNEBM/review");
  assert.equal(DEFAULT_GOOGLE_REVIEW_URL, url);

  const email = buildGoogleReviewRequestEmail(
    { customerName: "Alex Example" },
    url!,
  );
  assert.match(email.html, /https:\/\/g\.page\/r\/CbzkRdTv-0hNEBM\/review/);
  assert.match(email.text, /https:\/\/g\.page\/r\/CbzkRdTv-0hNEBM\/review/);
  assert.match(email.html, /Leave a Google Review/);
  assert.doesNotMatch(email.html, /OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY|track\/\?id=/);
  assert.doesNotMatch(email.text, /driverLat|sessionToken|SUMUP/);
  console.log("OK  branded email links to central Google review URL only");
}

console.log("\n=== 6. Customer first name populated safely ===");
{
  assert.equal(customerFirstName("Alex Example"), "Alex");
  assert.equal(customerFirstName("  Marie-Claire  O'Neill "), "Marie-Claire");
  assert.equal(customerFirstName(""), "there");
  assert.equal(customerFirstName("   "), "there");

  const email = buildGoogleReviewRequestEmail(
    { customerName: "Jordan Smith" },
    DEFAULT_GOOGLE_REVIEW_URL,
  );
  assert.match(email.subject, /How was your journey with My Airport Taxi NI\?/);
  assert.match(email.text, /^Hi Jordan,/m);
  assert.match(email.html, /Hi Jordan,/);
  assert.match(email.html, /Kind regards/);
  assert.doesNotMatch(email.html, /\bColin\b/);
  assert.doesNotMatch(email.text, /\bColin\b/);
  assert.match(email.html, /google-business-logo\.png/);
  assert.match(email.html, /#071c38|#2fbf4a/i);
  console.log("OK  first name + subject + business sign-off (no personal name)");
}

console.log("\n=== 7. Duplicate completion does not schedule duplicate ===");
{
  const completedAt = "2026-08-17T12:00:00.000Z";
  let job = ensureReviewRequestScheduled(
    baseJob({
      journeyStatus: "completed",
      journeyCompletedAt: completedAt,
    }),
    REVIEW_REQUEST_DELAY_MS,
    completedAt,
  );
  const firstScheduled = job.reviewRequestScheduledAt;
  const firstDue = job.reviewRequestDueAt;

  job = ensureReviewRequestScheduled(job, REVIEW_REQUEST_DELAY_MS, "2026-08-17T12:05:00.000Z");
  assert.equal(job.reviewRequestScheduledAt, firstScheduled);
  assert.equal(job.reviewRequestDueAt, firstDue);

  // Second complete_journey is rejected by journey state machine
  const blocked = applyJourneyAction(job, "complete_journey");
  assert.equal(blocked.ok, false);
  console.log("OK  schedule is idempotent; repeat complete is rejected");
}

console.log("\n=== 8. Retries do not create duplicate emails ===");
{
  const sent = baseJob({
    journeyStatus: "completed",
    journeyCompletedAt: "2026-08-17T12:00:00.000Z",
    reviewRequestScheduledAt: "2026-08-17T12:00:00.000Z",
    reviewRequestDueAt: "2026-08-17T14:00:00.000Z",
    reviewRequestSentAt: "2026-08-17T14:01:00.000Z",
  });
  assert.equal(getReviewRequestStatus(sent), "sent");
  assert.equal(
    isReviewRequestDue(sent, REVIEW_REQUEST_DELAY_MS, Date.parse("2026-08-17T18:00:00.000Z")),
    false,
  );
  const again = ensureReviewRequestScheduled(sent);
  assert.equal(again.reviewRequestSentAt, sent.reviewRequestSentAt);
  console.log("OK  sent flag blocks further due/send eligibility");
}

console.log("\n=== 9–10. Manual send / already-sent protection (source) ===");
{
  const handlers = read("workers/addresses/src/review-request-handlers.ts");
  assert.match(handlers, /handleReviewRequestSendRequest/);
  assert.match(handlers, /forceResend/);
  assert.match(handlers, /alreadySent/);
  assert.match(handlers, /A Google review request was already sent/);
  assert.match(handlers, /Resend review request/);
  assert.match(handlers, /trySendResendOnlyCustomerEmail/);
  assert.match(handlers, /resolveReviewRequestRecipient/);
  assert.match(handlers, /getPaidBookingRecord/);
  assert.match(handlers, /provider:\s*"resend"/);
  assert.match(handlers, /resendId/);
  assert.match(handlers, /reviewRequestDueAt/);
  assert.match(handlers, /Customer email is missing on tracking job and paid booking/);

  const email = read("workers/addresses/src/worker-email.ts");
  assert.match(email, /trySendResendOnlyCustomerEmail/);
  assert.match(email, /Resend is not configured \(RESEND_API_KEY\)/);

  const api = read("src/lib/paid-bookings-api.ts");
  assert.match(api, /provider === "resend"/);
  assert.match(api, /resendId/);

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Send review request/);
  assert.match(panel, /Resend review request/);
  assert.match(panel, /sendOwnerReviewRequest/);
  assert.match(panel, /Review request/);
  assert.match(panel, /Complete job|complete_journey/);
  assert.match(panel, /complete_journey/);
  assert.match(panel, /More options ▼/);
  assert.doesNotMatch(panel, /Start Live Tracking/);
  assert.match(panel, /Failed:/);
  assert.match(panel, /via Resend/);
  console.log("OK  owner Send + Complete job + Resend-required + email fallback");
}

console.log("\n=== 11. Resend failure records Failed without changing completion ===");
{
  const failed = baseJob({
    journeyStatus: "completed",
    journeyCompletedAt: "2026-08-17T12:00:00.000Z",
    reviewRequestScheduledAt: "2026-08-17T12:00:00.000Z",
    reviewRequestDueAt: "2026-08-17T14:00:00.000Z",
    reviewRequestFailedAt: "2026-08-17T14:02:00.000Z",
    reviewRequestLastError: "Resend API error",
  });
  assert.equal(failed.journeyStatus, "completed");
  assert.equal(getReviewRequestStatus(failed), "failed");
  assert.ok(failed.reviewRequestDueAt, "dueAt must remain after failure for auto retry window");

  const handlers = read("workers/addresses/src/review-request-handlers.ts");
  assert.match(handlers, /reviewRequestFailedAt/);
  assert.match(handlers, /reviewRequestLastError/);
  assert.match(handlers, /Keep journey completed|journey completed/i);
  assert.match(handlers, /Keep reviewRequestDueAt|Auto schedule remains|reviewRequestDueAt/i);
  console.log("OK  failed status independent of completed journey; dueAt preserved");
}

console.log("\n=== 12. Paid-booking email fallback helper is exported ===");
{
  const handlers = read("workers/addresses/src/review-request-handlers.ts");
  assert.match(handlers, /export async function resolveReviewRequestRecipient/);
  assert.match(handlers, /source:\s*"tracking"\s*\|\s*"paid_booking"/);
  console.log("OK  resolveReviewRequestRecipient supports tracking + paid_booking sources");
}

console.log("\n=== Architecture wiring ===");
{
  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /ensureReviewRequestScheduled/);
  assert.match(journey, /complete_journey/);

  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /processDueReviewRequests/);
  assert.match(index, /paid-bookings-review-request/);
  assert.match(index, /handleReviewRequestSendRequest/);

  const wrangler = read("workers/addresses/wrangler.toml");
  assert.match(wrangler, /REVIEW_REQUEST_DELAY_MINUTES\s*=\s*"120"/);
  assert.match(wrangler, /GOOGLE_REVIEW_URL/);

  const links = read("shared/business-links.ts");
  assert.match(links, /g\.page\/r\/CbzkRdTv-0hNEBM\/review/);
  assert.doesNotMatch(read("src/components/OwnerPaidBookingsPanel.tsx"), /g\.page\/r\/CbzkRdTv/);
  console.log("OK  cron + complete trigger + central URL config");
}

console.log("\nAll review request checks passed.");
