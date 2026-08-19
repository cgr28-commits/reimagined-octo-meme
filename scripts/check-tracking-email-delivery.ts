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

console.log("=== Initial confirmation omits website track CTA ===");
{
  const token = generateTrackingToken();
  const trackUrl = buildPublicTrackUrl(token);
  const email = buildCustomerConfirmationEmail(sampleReceipt, "My Airport Taxi NI", {
    trackUrl,
  });
  assert.doesNotMatch(email.html, /Track Your Driver/);
  assert.doesNotMatch(email.html, /LIVE DRIVER TRACKING/i);
  assert.doesNotMatch(email.text, /LIVE DRIVER TRACKING/);
  assert.doesNotMatch(email.html, /OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY/);
  assert.doesNotMatch(email.text, /OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY/);
  console.log("OK  confirmation ignores trackUrl — no customer website track CTA");
}

console.log("\n=== Resend path still uses confirmation builders ===");
{
  const resend = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(resend, /buildCustomerConfirmationEmail|buildUpdatedBookingConfirmationEmail/);
  console.log("OK  paid-booking handlers keep confirmation email builders");
}

console.log("\n=== Finalize still calls confirmation builder ===");
{
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /buildCustomerConfirmationEmail\(receipt, BUSINESS_NAME/);
  console.log("OK  paid finalize still builds customer confirmation");
}

console.log("\n=== Website tracking reminder cron is retired ===");
{
  const handlers = read("workers/addresses/src/tracking-reminder-handlers.ts");
  assert.match(handlers, /Customer website live-tracking reminders are retired/);
  assert.match(handlers, /processDueTrackingAvailableReminders/);
  // Builder retained for offline/legacy tests but cron no longer sends.
  const token = generateTrackingToken();
  const trackUrl = buildPublicTrackUrl(token);
  const job = baseJob({
    token,
    pickupAt: "2026-09-01T10:00",
  });
  const windowOpen = Date.parse("2026-09-01T09:05:00+01:00");
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
  assert.match(reminder.html, /Track Your Driver/);
  console.log("OK  reminder builder retained offline; live cron path is no-op");
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

console.log("\n=== Customer website track page is retired ===");
{
  const a = generateTrackingToken();
  const b = generateTrackingToken();
  assert.notEqual(a, b);
  const urlA = buildPublicTrackUrl(a);
  const urlB = buildPublicTrackUrl(b);
  assert.notEqual(urlA, urlB);

  const page = read("src/app/track/page.tsx");
  assert.match(page, /Driver updates by email/);
  assert.doesNotMatch(page, /TrackPageClient/);
  assert.match(page, /Message us on WhatsApp/);
  console.log("OK  /track no longer mounts live map client");
}

console.log("\n=== Cron still calls reminder processor (now a no-op) ===");
{
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /processDueTrackingAvailableReminders/);
  const handlers = read("workers/addresses/src/tracking-reminder-handlers.ts");
  assert.match(handlers, /Customer website live-tracking reminders are retired/);
  const sharing = read("workers/addresses/src/tracking-handlers.ts");
  assert.doesNotMatch(sharing, /sendSharingReminderEmail/);
  assert.doesNotMatch(sharing, /buildTrackingReminderEmail/);
  console.log("OK  cron entry retained; live reminder sends disabled");
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
