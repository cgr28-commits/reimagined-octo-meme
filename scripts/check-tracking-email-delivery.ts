/**
 * Customer tracking link delivery — confirmation emails + 60-minute reminder.
 * Run: npx tsx scripts/check-tracking-email-delivery.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCustomerConfirmationEmail,
  buildTrackingReminderEmail,
} from "../shared/booking-notifications";
import {
  buildPublicTrackUrl,
  evaluateTrackingAvailableReminder,
  generateTrackingToken,
  getTrackingWindow,
  isTrackingAvailableReminderDue,
  resolveEmailTrackUrl,
  type TrackingJobRecord,
} from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const sampleReceipt = {
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  mobileNumber: "07123456789",
  tripLabel: "Ballyclare → Belfast International (BFS)",
  pickupLabel: "249 Rashee Road, Ballyclare",
  dropoffLabel: "Belfast International Airport (BFS)",
  returnJourney: false,
  tripDate: "2026-09-01",
  tripTime: "10:00",
  returnDate: "",
  returnTime: "",
  flightNumber: "EZY123",
  passengers: 2,
  suitcases: 2,
  vehicle: "Estate Car (1–4 passengers)",
  isAirportTrip: true,
  airportCode: "BFS",
  amountPaid: "£45.00",
  paymentReference: "T3TESTREF",
  checkoutReference: "matni-test-ref",
};

function baseJob(overrides: Partial<TrackingJobRecord> = {}): TrackingJobRecord {
  return {
    token: generateTrackingToken(),
    createdAt: new Date().toISOString(),
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    customerMobile: "07123456789",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: "2026-09-01",
    tripTime: "10:00",
    pickupAt: "2026-09-01T10:00",
    sharingActive: false,
    paymentReference: "T3TESTREF",
    ...overrides,
  };
}

console.log("=== Initial confirmation includes tracking URL ===");
{
  const token = generateTrackingToken();
  const trackUrl = buildPublicTrackUrl(token);
  const email = buildCustomerConfirmationEmail(sampleReceipt, "My Airport Taxi NI", {
    trackUrl,
  });
  assert.match(email.html, /Track Your Driver/);
  assert.match(email.html, new RegExp(token));
  assert.match(email.html, /\/track\/\?id=/);
  assert.match(email.text, new RegExp(token));
  assert.doesNotMatch(email.html, /OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY/);
  assert.doesNotMatch(email.text, /OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY/);
  console.log("OK  initial confirmation HTML/text include secure track URL + CTA");
}

console.log("\n=== Resend path resolves and passes trackUrl ===");
{
  const resend = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(resend, /resolvePaidBookingTrackUrl/);
  assert.match(resend, /buildCustomerConfirmationEmail\(receipt, BUSINESS_NAME, \{/);
  assert.match(resend, /trackUrl,/);
  assert.match(resend, /resolveEmailTrackUrl/);
  // Must not call confirmation builder without options after the resend fix.
  assert.doesNotMatch(
    resend,
    /const customerEmail = buildCustomerConfirmationEmail\(receipt, BUSINESS_NAME\);/,
  );
  console.log("OK  resend confirmation passes current trackUrl into email builder");
}

console.log("\n=== Finalize initial confirmation still passes trackUrl ===");
{
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(
    finalize,
    /buildCustomerConfirmationEmail\(receipt, BUSINESS_NAME, \{\s*trackUrl: tracking\.trackUrl/,
  );
  console.log("OK  paid finalize includes tracking.trackUrl in customer confirmation");
}

console.log("\n=== 60-minute reminder sends once ===");
{
  const token = generateTrackingToken();
  const trackUrl = buildPublicTrackUrl(token);
  const job = baseJob({
    token,
    pickupAt: "2026-09-01T10:00",
  });

  // 90 minutes before pickup — too early
  const tooEarly = Date.parse("2026-09-01T08:30:00+01:00");
  assert.equal(isTrackingAvailableReminderDue(job.pickupAt, tooEarly), false);
  assert.equal(evaluateTrackingAvailableReminder(job, tooEarly), "not_eligible");

  // ~60 minutes before — window open
  const windowOpen = Date.parse("2026-09-01T09:05:00+01:00");
  assert.equal(isTrackingAvailableReminderDue(job.pickupAt, windowOpen), true);
  assert.equal(evaluateTrackingAvailableReminder(job, windowOpen), "eligible");

  const reminder = buildTrackingReminderEmail(
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
  assert.match(reminder.subject, /Your driver tracking is now available/);
  assert.match(reminder.html, /Track Your Driver/);
  assert.match(reminder.html, /My Airport Taxi NI/);
  assert.match(reminder.html, /Alex Example/);
  assert.match(reminder.html, /T3TESTREF/);
  assert.match(reminder.html, new RegExp(token));
  assert.match(reminder.text, /Track Your Driver/);

  // Already sent — never eligible again
  const sentJob = { ...job, sharingReminderSentAt: new Date(windowOpen).toISOString() };
  assert.equal(evaluateTrackingAvailableReminder(sentJob, windowOpen), "not_eligible");
  console.log("OK  reminder due at ~1h, branded once, skipped after sent flag");
}

console.log("\n=== Expired / revoked token is not emailed ===");
{
  assert.equal(resolveEmailTrackUrl(null), undefined);
  assert.equal(resolveEmailTrackUrl(undefined), undefined);
  assert.equal(resolveEmailTrackUrl(baseJob({ token: "" })), undefined);
  assert.equal(
    resolveEmailTrackUrl(baseJob({ refundedAt: "2026-09-01T08:00:00.000Z" })),
    undefined,
  );

  const valid = baseJob();
  const url = resolveEmailTrackUrl(valid);
  assert.ok(url);
  assert.match(url!, new RegExp(valid.token));
  assert.doesNotMatch(url!, /OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY/);

  const sharedTracking = read("shared/tracking.ts");
  assert.match(sharedTracking, /function resolveEmailTrackUrl/);
  assert.match(sharedTracking, /refundedAt/);
  assert.match(sharedTracking, /sharingReminderSentAt/);
  assert.match(sharedTracking, /evaluateTrackingAvailableReminder/);

  const handlers = read("workers/addresses/src/tracking-reminder-handlers.ts");
  assert.match(handlers, /evaluateTrackingAvailableReminder/);
  assert.match(handlers, /resolveEmailTrackUrl/);
  assert.match(handlers, /sharingReminderSentAt/);
  console.log("OK  missing/refunded tokens yield no email URL");
}

console.log("\n=== Customer cannot access other bookings (token isolation) ===");
{
  const a = generateTrackingToken();
  const b = generateTrackingToken();
  assert.notEqual(a, b);
  const urlA = buildPublicTrackUrl(a);
  const urlB = buildPublicTrackUrl(b);
  assert.notEqual(urlA, urlB);
  assert.match(urlA, new RegExp(`id=${a}`));
  assert.doesNotMatch(urlA, new RegExp(b));

  const trackHandlers = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(trackHandlers, /handlePublicTrackRequest/);
  assert.match(trackHandlers, /getTrackingJob\(env\.TRACKING_STORE, trimmed\)/);
  assert.doesNotMatch(
    trackHandlers,
    /handlePublicTrackRequest[\s\S]{0,400}paymentReference.*getPaidBookingRecord/,
  );

  const page = read("src/app/track/TrackPageClient.tsx");
  assert.match(
    page,
    /Live driver tracking will become available approximately 1 hour before your scheduled pickup\./,
  );
  assert.match(page, /Your driver has not started live tracking yet/);
  console.log("OK  public track is token-scoped; early/not-started copy present");
}

console.log("\n=== Cron wired for tracking-available reminders ===");
{
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /processDueTrackingAvailableReminders/);
  assert.match(index, /Tracking available reminder cron/);
  // Driver share toggle must not send the old start-sharing reminder (avoids duplicates).
  const sharing = read("workers/addresses/src/tracking-handlers.ts");
  assert.doesNotMatch(sharing, /sendSharingReminderEmail/);
  assert.doesNotMatch(sharing, /buildTrackingReminderEmail/);
  console.log("OK  hourly cron sends window reminder; driver-start email removed");
}

console.log("\n=== Tracking window opens ~60 minutes before pickup ===");
{
  const pickupAt = "2026-09-01T10:00";
  const early = getTrackingWindow(pickupAt, new Date("2026-09-01T08:30:00+01:00"));
  assert.equal(early.open, false);
  assert.equal(early.reason, "too_early");
  const open = getTrackingWindow(pickupAt, new Date("2026-09-01T09:05:00+01:00"));
  assert.equal(open.open, true);
  console.log("OK  customer window opens about 1 hour before pickup");
}

console.log("\nAll tracking email delivery checks passed.");
