/**
 * Abandoned booking recovery — pure logic + architecture smoke checks.
 * Uses controllable timestamps (no real 1-hour wait).
 * Run: npx tsx scripts/check-abandoned-booking-recovery.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABANDONED_BOOKING_REMINDER_DELAY_MS,
  buildAbandonedBookingFingerprint,
  buildAbandonedBookingOptOutUrl,
  buildAbandonedBookingRecoveryUrl,
  computeAbandonedExpiresAt,
  computeAbandonedReminderDueAt,
  generateAbandonedBookingToken,
  isAbandonedBookingReminderDue,
  normalizeAbandonedBookingToken,
  shouldSendAbandonedBookingReminder,
  type AbandonedBookingRecord,
} from "../shared/abandoned-booking-recovery";
import { buildAbandonedBookingRecoveryEmail } from "../shared/abandoned-booking-recovery-emails";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function baseRecord(overrides: Partial<AbandonedBookingRecord> = {}): AbandonedBookingRecord {
  const created = new Date("2026-08-21T10:00:00.000Z");
  return {
    id: "abc123",
    token: "a".repeat(48),
    customerName: "Richard Chambers",
    customerEmail: "richard@example.com",
    mobileNumber: "07700900123",
    journey: {
      pickupLabel: "1 Main St, Belfast",
      dropoffLabel: "Belfast International Airport",
      airportCode: "BFS",
      isAirportTrip: true,
      tripDate: "2026-08-25",
      tripTime: "09:00",
      returnJourney: false,
      passengers: 2,
      suitcases: 2,
      quotedAmount: 42.5,
      quotedAmountLabel: "£42.50",
      quoteStep: 3,
    },
    fingerprint: "fp",
    status: "awaiting_reminder",
    createdAt: created.toISOString(),
    reminderDueAt: computeAbandonedReminderDueAt(created),
    expiresAt: computeAbandonedExpiresAt(created),
    ...overrides,
  };
}

function run() {
  const token = generateAbandonedBookingToken();
  assert.equal(token.length, 48);
  assert.equal(normalizeAbandonedBookingToken(token), token);

  const url = buildAbandonedBookingRecoveryUrl(token);
  assert.match(url, /[?&]abr=/);
  assert.ok(!url.includes("@"));
  assert.ok(!url.includes("Richard"));
  assert.ok(!url.includes("07700"));
  assert.ok(!url.includes("42.5"));

  const optOut = buildAbandonedBookingOptOutUrl(token);
  assert.match(optOut, /scope=booking-recovery/);
  assert.ok(!optOut.includes("richard@"));

  const created = new Date("2026-08-21T10:00:00.000Z");
  const record = baseRecord();
  assert.equal(
    isAbandonedBookingReminderDue(record, new Date("2026-08-21T10:30:00.000Z")),
    false,
    "not due before 1 hour",
  );
  assert.equal(
    isAbandonedBookingReminderDue(record, new Date("2026-08-21T11:00:00.000Z")),
    true,
    "due at 1 hour",
  );
  assert.equal(
    Date.parse(record.reminderDueAt) - Date.parse(record.createdAt),
    ABANDONED_BOOKING_REMINDER_DELAY_MS,
  );

  assert.equal(
    shouldSendAbandonedBookingReminder(record, {
      now: new Date("2026-08-21T11:05:00.000Z"),
      alreadyPaid: true,
    }),
    false,
    "no reminder after payment",
  );
  assert.equal(
    shouldSendAbandonedBookingReminder(record, {
      now: new Date("2026-08-21T11:05:00.000Z"),
      optedOut: true,
    }),
    false,
    "no reminder after opt-out",
  );
  assert.equal(
    shouldSendAbandonedBookingReminder(
      baseRecord({ reminderSentAt: created.toISOString(), status: "reminder_sent" }),
      { now: new Date("2026-08-21T12:00:00.000Z") },
    ),
    false,
    "cannot send twice",
  );
  assert.equal(
    shouldSendAbandonedBookingReminder(record, {
      now: new Date("2026-08-21T11:05:00.000Z"),
      cancelledOrRefunded: true,
    }),
    false,
  );
  assert.equal(
    shouldSendAbandonedBookingReminder(record, {
      now: new Date("2026-08-21T11:05:00.000Z"),
    }),
    true,
  );

  const fp = buildAbandonedBookingFingerprint({
    customerEmail: "Richard@Example.com",
    journey: record.journey,
  });
  assert.ok(fp.includes("richard"));
  assert.ok(fp.includes("example.com".replace(".", "")) || fp.includes("examplecom"));
  assert.equal(
    buildAbandonedBookingFingerprint({
      customerEmail: "richard@example.com",
      journey: record.journey,
    }),
    fp,
  );

  const email = buildAbandonedBookingRecoveryEmail(record);
  assert.equal(email.subject, "Still need your airport transfer?");
  assert.match(email.text, /Continue My Booking|continue your booking/i);
  assert.match(email.html, /Continue My Booking/);
  assert.match(email.html, /Stop booking recovery emails/);
  assert.ok(!email.html.includes("richard@example.com?"));
  assert.match(email.html, /abr=/);

  // Architecture wiring
  const handlers = read("workers/addresses/src/abandoned-booking-handlers.ts");
  const store = read("workers/addresses/src/abandoned-booking-store.ts");
  const index = read("workers/addresses/src/index.ts");
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  const card = read("src/components/QuoteCard.tsx");
  const ownerPanel = read("src/components/OwnerAbandonedBookingsPanel.tsx");
  const ownerClient = read("src/app/driver/DriverPageClient.tsx");
  const privacy = read("src/lib/privacy.ts");
  const wrangler = read("workers/addresses/wrangler.toml");

  assert.match(handlers, /processDueAbandonedBookingRecoveryEmails/);
  assert.match(handlers, /tryClaimAbandonedBookingReminder/);
  assert.match(handlers, /paymentBlocksReminder|getPaidBookingRecordByCheckoutId/);
  assert.match(handlers, /isSumUpCheckoutPaid/);
  assert.match(handlers, /isAbandonedBookingEmailOptedOut/);
  assert.match(store, /tryClaimAbandonedBookingReminder/);
  assert.match(store, /markAbandonedBookingRecovered/);
  assert.match(index, /processDueAbandonedBookingRecoveryEmails/);
  assert.match(index, /captureAbandonedBookingFromCheckout/);
  assert.match(index, /isAbandonedBookingsCapturePath/);
  assert.match(finalize, /markAbandonedBookingRecoveredFromPayment/);
  assert.match(card, /captureAbandonedBooking/);
  assert.match(card, /fetchAbandonedBookingByToken/);
  assert.match(card, /abr/);
  assert.match(card, /not a marketing email/);
  assert.match(ownerPanel, /Abandoned bookings/);
  assert.match(ownerPanel, /Awaiting reminder/);
  assert.match(ownerPanel, /Reminder sent/);
  assert.match(ownerPanel, /Recovered/);
  assert.match(ownerClient, /OwnerAbandonedBookingsPanel/);
  assert.match(privacy, /Incomplete booking recovery/);
  assert.match(wrangler, /ABANDONED_BOOKING_REMINDER_DELAY_MINUTES/);

  // Must not auto-start SumUp from recovery path
  assert.doesNotMatch(handlers, /createSumUpHostedCheckout/);
  assert.doesNotMatch(card, /createPaymentCheckout\(\{[\s\S]*abr/);

  console.log("OK  opaque recovery URL (no PII)");
  console.log("OK  1-hour eligibility with controllable timestamps");
  console.log("OK  paid / opt-out / already-sent / cancelled gates");
  console.log("OK  branded recovery email + opt-out link");
  console.log("OK  worker cron + claim-before-send + payment recheck wired");
  console.log("OK  Owner Abandoned bookings panel + privacy disclosure");
  console.log("\nAll abandoned-booking recovery checks passed.");
}

run();
