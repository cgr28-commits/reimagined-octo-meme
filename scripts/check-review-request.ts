/**
 * Post-journey Google review request system — offline checks.
 * Run: npx tsx scripts/check-review-request.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildArrivedPickupWhatsAppLink } from "../shared/arrival-whatsapp";
import {
  buildGoogleReviewRequestEmail,
  buildGoogleReviewRequestWhatsAppMessage,
  customerFirstName,
} from "../shared/booking-notifications";
import {
  GOOGLE_REVIEW_SMS_CHANNEL_ENABLED,
  googleReviewRequestChannels,
} from "../shared/google-review-channels";
import { isUsableMailbox } from "../shared/owner-email-copy";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  resolveGoogleReviewUrl,
} from "../shared/business-links";
import { paidBookingRefKey } from "../shared/paid-booking-record";
import {
  applyJourneyAction,
  clearUnsentReviewRequest,
  ensureReviewRequestScheduled,
  generateTrackingToken,
  getReviewRequestStatus,
  isReviewRequestDue,
  reopenCompletedJourney,
  REVIEW_REQUEST_DELAY_MS,
  resolveReviewRequestDelayMs,
  reviewRequestSendRefusal,
  type TrackingJobRecord,
} from "../shared/tracking";
import {
  paidBookingCancelsReviewRequest,
  reloadReviewRequestEligibility,
} from "../workers/addresses/src/review-request-handlers";
import { getTrackingJob, markTrackingJobRefunded, saveTrackingJob } from "../workers/addresses/src/tracking-store";

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
  assert.equal(cancelled.reviewRequestScheduledAt, undefined);
  assert.equal(cancelled.reviewRequestDueAt, undefined);
  assert.equal(
    isReviewRequestDue(cancelled, REVIEW_REQUEST_DELAY_MS, Date.parse("2026-08-17T15:00:00.000Z")),
    false,
  );
  console.log("OK  refunded completed jobs are not scheduled or due");
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
  assert.match(handlers, /A Google review email was already sent/);
  assert.match(handlers, /Resend Email Review Request/);
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
  assert.match(panel, /Email Review Request/);
  assert.match(panel, /Resend Email Review Request/);
  assert.match(panel, /WhatsApp Review Request/);
  assert.match(panel, /buildGoogleReviewRequestWhatsAppMessage/);
  assert.match(panel, /openReviewWhatsAppForBooking/);
  assert.doesNotMatch(panel, /SMS Review Request/);
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

console.log("\n=== Email and WhatsApp review channels share one message ===");
{
  assert.equal(GOOGLE_REVIEW_SMS_CHANNEL_ENABLED, false);
  assert.equal(isUsableMailbox("alex@example.com"), true);
  assert.equal(isUsableMailbox("  "), false);
  assert.equal(isUsableMailbox("not-an-email"), false);
  assert.deepEqual(
    googleReviewRequestChannels({ hasUsableEmail: false, hasUsableMobile: false }),
    [],
  );
  assert.deepEqual(
    googleReviewRequestChannels({ hasUsableEmail: true, hasUsableMobile: false }),
    ["email"],
  );
  assert.deepEqual(
    googleReviewRequestChannels({ hasUsableEmail: false, hasUsableMobile: true }),
    ["whatsapp"],
  );
  assert.deepEqual(
    googleReviewRequestChannels({ hasUsableEmail: true, hasUsableMobile: true }),
    ["email", "whatsapp"],
  );

  const email = buildGoogleReviewRequestEmail(
    { customerName: "Alex Example" },
    DEFAULT_GOOGLE_REVIEW_URL,
  );
  const whatsapp = buildGoogleReviewRequestWhatsAppMessage({ customerName: "Alex Example" });
  assert.equal(whatsapp, email.text);
  assert.match(whatsapp, /g\.page\/r\/CbzkRdTv-0hNEBM\/review/);

  const link = buildArrivedPickupWhatsAppLink("07700900123", whatsapp);
  assert.match(link, /^https:\/\/wa\.me\/447700900123\?text=/);
  assert.match(decodeURIComponent(link), /Leave a Google Review:/);
  assert.doesNotMatch(link, /api\.whatsapp|graph\.facebook/i);

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /hasUsableEmail: isUsableMailbox\(booking\.customerEmail\)/);
  const reviewWhatsApp = panel.slice(
    panel.indexOf("function openReviewWhatsAppForBooking"),
    panel.indexOf("function openOnTheWayWhatsAppForBooking"),
  );
  assert.match(reviewWhatsApp, /buildGoogleReviewRequestWhatsAppMessage/);
  assert.match(reviewWhatsApp, /buildArrivedPickupWhatsAppLink/);
  assert.doesNotMatch(reviewWhatsApp, /sendOwnerReviewRequest/);
  assert.match(panel, />\s*WhatsApp\s*</);
  assert.doesNotMatch(panel, /SMS Review Request/);

  const ownerCopy = panel.slice(
    panel.indexOf("function reviewOwnerCopyLabel"),
    panel.indexOf("function formatArrivedPickupHhMm"),
  );
  assert.match(ownerCopy, /Customer email was sent\. Owner BCC copy was not sent\./);
  assert.match(ownerCopy, /Owner copy included/);
  assert.doesNotMatch(ownerCopy, /@/);

  const handlers = read("workers/addresses/src/review-request-handlers.ts");
  assert.match(handlers, /Review request customer email was sent\. Owner BCC copy was not sent\./);
  assert.match(handlers, /reviewRequestOwnerBccSent/);
  assert.match(handlers, /customerEmailSent: true/);
  assert.match(handlers, /ownerBccSent: sendResult\.ownerBccSent === true/);
  assert.match(handlers, /trySendResendOnlyCustomerEmail/);
  console.log("OK  email + manual WhatsApp review; SMS hidden; BCC outcome is explicit");
}

function memoryKv() {
  const data = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw) as unknown;
      return raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
  return store as unknown as KVNamespace;
}

const COMPLETED_AT = "2026-08-17T12:00:00.000Z";
const DUE_AT = "2026-08-17T14:00:00.000Z";

function pendingReview(overrides: Partial<TrackingJobRecord> = {}): TrackingJobRecord {
  return baseJob({
    token: "review-job",
    journeyStatus: "completed",
    journeyCompletedAt: COMPLETED_AT,
    reviewRequestScheduledAt: COMPLETED_AT,
    reviewRequestDueAt: DUE_AT,
    paymentReference: "REVIEW-PAY",
    ...overrides,
  });
}

console.log("\n=== 13. Cancelled journeys never qualify for a review email ===");
void (async () => {
  const booked = baseJob({
    journeyStatus: "idle",
    refundedAt: "2026-08-17T11:00:00.000Z",
  });
  assert.equal(ensureReviewRequestScheduled(booked).reviewRequestScheduledAt, undefined);
  assert.equal(reviewRequestSendRefusal(booked), "cancelled");

  const started = baseJob({
    journeyStatus: "en_route",
    journeyStartedAt: "2026-08-17T11:30:00.000Z",
    refundedAt: "2026-08-17T11:40:00.000Z",
  });
  assert.equal(ensureReviewRequestScheduled(started).reviewRequestScheduledAt, undefined);
  assert.equal(reviewRequestSendRefusal(started), "cancelled");

  const completed = ensureReviewRequestScheduled(
    baseJob({
      journeyStatus: "completed",
      journeyCompletedAt: COMPLETED_AT,
    }),
    REVIEW_REQUEST_DELAY_MS,
    COMPLETED_AT,
  );
  assert.equal(getReviewRequestStatus(completed), "scheduled");
  assert.equal(reviewRequestSendRefusal(completed), null);

  const store = memoryKv();
  const scheduled = pendingReview();
  await saveTrackingJob(store, scheduled, { indexPaymentReference: false });
  await store.put(
    paidBookingRefKey("REVIEW-PAY"),
    JSON.stringify({
      paymentReference: "REVIEW-PAY",
      operationalStatus: "cancelled",
      status: "cancelled",
      cancelledAt: "2026-08-17T13:00:00.000Z",
    }),
  );
  const beforeSend = await reloadReviewRequestEligibility(store, scheduled.token);
  assert.equal(beforeSend.action, "skip");
  assert.equal(beforeSend.reason, "cancelled");
  const cleared = await getTrackingJob(store, scheduled.token);
  assert.equal(cleared?.reviewRequestScheduledAt, undefined);
  assert.equal(cleared?.reviewRequestDueAt, undefined);
  assert.equal(cleared?.reviewRequestSentAt, undefined);
  assert.equal(cleared?.journeyCompletedAt, COMPLETED_AT);
  assert.equal(cleared?.paymentReference, "REVIEW-PAY");

  const sentThenCancelled = pendingReview({
    token: "sent-then-cancelled",
    reviewRequestSentAt: "2026-08-17T14:05:00.000Z",
    reviewRequestOwnerBccSent: true,
    refundedAt: "2026-08-17T15:00:00.000Z",
  });
  await saveTrackingJob(store, sentThenCancelled, { indexPaymentReference: false });
  const second = await reloadReviewRequestEligibility(store, sentThenCancelled.token, {
    allowAlreadySent: true,
  });
  assert.equal(second.action, "skip");
  assert.equal(second.reason, "cancelled");
  const kept = await getTrackingJob(store, sentThenCancelled.token);
  assert.equal(kept?.reviewRequestSentAt, sentThenCancelled.reviewRequestSentAt);
  assert.equal(kept?.reviewRequestOwnerBccSent, true);
  assert.equal(kept?.reviewRequestScheduledAt, COMPLETED_AT);

  const reopened = reopenCompletedJourney(pendingReview({ token: "reopened", paymentReference: "OTHER" }));
  assert.equal(reopened.reviewOutcome, "cancelled");
  assert.equal(reopened.job.reviewRequestDueAt, undefined);
  assert.notEqual(reopened.job.journeyStatus, "completed");
  assert.equal(reviewRequestSendRefusal(reopened.job), "not_completed");

  const stuck = pendingReview({
    token: "stuck-cancelled",
    refundedAt: "2026-08-17T13:30:00.000Z",
  });
  await saveTrackingJob(store, stuck, { indexPaymentReference: false });
  const refused = await reloadReviewRequestEligibility(store, stuck.token);
  assert.equal(refused.action, "skip");
  assert.equal(refused.reason, "cancelled");
  assert.equal((await getTrackingJob(store, stuck.token))?.reviewRequestDueAt, undefined);

  const genuine = pendingReview({ token: "genuine", paymentReference: "STILL-CONFIRMED" });
  await saveTrackingJob(store, genuine, { indexPaymentReference: false });
  await store.put(
    paidBookingRefKey("STILL-CONFIRMED"),
    JSON.stringify({
      paymentReference: "STILL-CONFIRMED",
      operationalStatus: "confirmed",
      status: "confirmed",
    }),
  );
  const firstSend = await reloadReviewRequestEligibility(store, genuine.token);
  assert.equal(firstSend.action, "send");
  const markedSent: TrackingJobRecord = {
    ...genuine,
    reviewRequestSentAt: "2026-08-17T14:05:00.000Z",
  };
  await saveTrackingJob(store, markedSent, { indexPaymentReference: false });
  const duplicate = await reloadReviewRequestEligibility(store, genuine.token);
  assert.equal(duplicate.action, "skip");
  assert.equal(duplicate.reason, "already_sent");

  assert.equal(
    paidBookingCancelsReviewRequest(
      { operationalStatus: "confirmed", status: "confirmed", returnCancelledAt: "2026-08-17T13:00:00.000Z" },
      "outbound",
    ),
    false,
  );
  assert.equal(
    paidBookingCancelsReviewRequest(
      { operationalStatus: "confirmed", status: "confirmed", returnCancelledAt: "2026-08-17T13:00:00.000Z" },
      "return",
    ),
    true,
  );

  const closedOnCancel = pendingReview({ token: "closed-on-cancel" });
  await saveTrackingJob(store, closedOnCancel, { indexPaymentReference: false });
  const marked = await markTrackingJobRefunded(store, closedOnCancel.token, "Cancelled", {
    closeJourney: true,
  });
  assert.equal(marked, true);
  const afterCancel = await getTrackingJob(store, closedOnCancel.token);
  assert.equal(afterCancel?.journeyStatus, "completed");
  assert.ok(afterCancel?.refundedAt);
  assert.equal(afterCancel?.reviewRequestScheduledAt, undefined);
  assert.equal(afterCancel?.reviewRequestDueAt, undefined);
  assert.equal(afterCancel?.journeyCompletedAt, COMPLETED_AT);
  assert.equal(ensureReviewRequestScheduled(afterCancel!).reviewRequestDueAt, undefined);
  assert.equal(clearUnsentReviewRequest(afterCancel!).reviewRequestSentAt, undefined);

  console.log("OK  cancelled, reopened, and leftover pending reviews cannot send; one genuine completion can");
  console.log("\nAll review request checks passed.");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
