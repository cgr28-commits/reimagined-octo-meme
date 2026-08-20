/**
 * Owner Dashboard operational cleanup — Upcoming vs Completed History filters.
 * Offline only: no SumUp, Resend, or KV.
 * Run: npx tsx scripts/check-owner-dashboard-job-cleanup.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  groupCompletedBookingsByDay,
  isCompletedWorkBooking,
  isOwnerOperationalTestBooking,
  isUpcomingWorkBooking,
  ownerUpcomingPrimaryJourneyActions,
  resolveCompletionTimestamp,
} from "../shared/upcoming-jobs";
import { refundTestIsolationDecoyPaymentReference } from "../shared/refund-test-isolation";

const root = process.cwd();
const today = "2026-08-20";

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Test booking detection (flags preferred over names) ===");
{
  assert.equal(isOwnerOperationalTestBooking({ isRefundTest: true }), true);
  assert.equal(isOwnerOperationalTestBooking({ isAmendmentTestFixture: true }), true);
  assert.equal(
    isOwnerOperationalTestBooking({
      paymentReference: "REFUND-TEST-123",
    }),
    true,
  );
  assert.equal(
    isOwnerOperationalTestBooking({
      paymentReference: "AMEND-TEST-ABC",
    }),
    true,
  );
  assert.equal(
    isOwnerOperationalTestBooking({
      paymentReference: refundTestIsolationDecoyPaymentReference("TAA123"),
    }),
    true,
  );
  assert.equal(
    isOwnerOperationalTestBooking({
      paymentReference: "TAA-REAL-001",
    }),
    false,
    "genuine payment refs are not treated as tests",
  );
  assert.equal(
    isOwnerOperationalTestBooking({
      paymentReference: "TAA-CUSTOMER-TEST-STREET",
    }),
    false,
    "payment refs containing the word test (without REFUND-TEST-/AMEND-TEST- prefix) stay visible",
  );
  console.log("OK  isRefundTest / amendment / REFUND-TEST- / AMEND-TEST- / isolation decoy");
}

console.log("\n=== 2. Upcoming Jobs matrix ===");
{
  const futureReal = {
    status: "confirmed",
    tripDate: "2026-08-25",
    tripTime: "10:00",
    journeyStatus: "idle",
    paymentReference: "TAA-FUTURE",
  };
  assert.equal(isUpcomingWorkBooking(futureReal, today), true, "future real → Upcoming");
  assert.equal(isCompletedWorkBooking(futureReal), false);
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "idle",
      sharingActive: false,
      bookingStatus: "confirmed",
    }),
    ["start_tracking", "arrived_pickup"],
    "new genuine booking → Driver on the way + Driver has arrived",
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "tracking",
      sharingActive: true,
      bookingStatus: "confirmed",
    }),
    ["start_tracking", "arrived_pickup"],
    "tracking status still keeps both customer update actions",
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "arrived_pickup",
      bookingStatus: "confirmed",
    }),
    [],
    "after arrival, primary on-the-way/arrived CTAs are done",
  );

  const completedReal = {
    status: "confirmed",
    tripDate: "2026-08-18",
    tripTime: "09:00",
    journeyStatus: "completed",
    allLegsCompleted: true,
    journeyCompletedAt: "2026-08-18T10:30:00.000Z",
    paymentReference: "TAA-DONE",
  };
  assert.equal(
    isUpcomingWorkBooking(completedReal, today),
    false,
    "completed real → not Upcoming",
  );
  assert.equal(isCompletedWorkBooking(completedReal), true, "completed real → History");

  // Pamela Brown–class: return booking fully done but stale allLegsCompleted:false
  // and nextUnfinishedLegDate still set to the return date.
  const pamelaBrown = {
    customerName: "Pamela Brown",
    status: "confirmed",
    tripDate: "2026-08-08",
    tripTime: "12:15",
    returnJourney: true,
    returnDate: "2026-08-19",
    returnTime: "02:35",
    outboundJourneyStatus: "completed",
    returnJourneyStatus: "completed",
    journeyStatus: "completed",
    allLegsCompleted: false,
    nextUnfinishedLegDate: "2026-08-19",
    nextUnfinishedLegTime: "02:35",
    journeyCompletedAt: "2026-08-19T03:10:00.000Z",
    paymentReference: "TAA-PAMELA-BROWN",
  };
  assert.equal(
    isUpcomingWorkBooking(pamelaBrown, today),
    false,
    "Pamela Brown completed return → not Upcoming",
  );
  assert.equal(
    isCompletedWorkBooking(pamelaBrown),
    true,
    "Pamela Brown completed return → History only",
  );

  const cancelledReal = {
    status: "cancelled",
    tripDate: "2026-08-22",
    tripTime: "12:00",
    journeyStatus: "idle",
    cancelledAt: "2026-08-19T12:00:00.000Z",
    paymentReference: "TAA-CANCEL",
  };
  assert.equal(isUpcomingWorkBooking(cancelledReal, today), false);
  assert.equal(isCompletedWorkBooking(cancelledReal), true);

  const refundedReal = {
    status: "refunded",
    tripDate: "2026-08-22",
    tripTime: "12:00",
    journeyStatus: "idle",
    refundedAt: "2026-08-19T13:00:00.000Z",
    paymentReference: "TAA-REFUND",
  };
  assert.equal(isUpcomingWorkBooking(refundedReal, today), false);
  assert.equal(isCompletedWorkBooking(refundedReal), true);

  const pastIncomplete = {
    status: "confirmed",
    tripDate: "2026-08-10",
    tripTime: "08:00",
    journeyStatus: "idle",
    paymentReference: "TAA-PAST",
  };
  assert.equal(
    isUpcomingWorkBooking(pastIncomplete, today),
    false,
    "past incomplete trip day → not Upcoming",
  );

  const refundTest = {
    status: "confirmed",
    tripDate: "2026-08-25",
    tripTime: "10:00",
    journeyStatus: "idle",
    isRefundTest: true,
    paymentReference: "REFUND-TEST-LIVE",
  };
  assert.equal(isUpcomingWorkBooking(refundTest, today), false);
  assert.equal(isCompletedWorkBooking(refundTest), false);
  assert.equal(isOwnerOperationalTestBooking(refundTest), true);

  const isolation = {
    status: "confirmed",
    tripDate: "2026-08-25",
    tripTime: "10:00",
    journeyStatus: "idle",
    paymentReference: refundTestIsolationDecoyPaymentReference("TAA999"),
  };
  assert.equal(isUpcomingWorkBooking(isolation, today), false);
  assert.equal(isCompletedWorkBooking(isolation), false);

  const amendment = {
    status: "confirmed",
    tripDate: "2026-08-25",
    tripTime: "10:00",
    journeyStatus: "completed",
    allLegsCompleted: true,
    isAmendmentTestFixture: true,
    paymentReference: "AMEND-TEST-FARE",
  };
  assert.equal(isUpcomingWorkBooking(amendment, today), false);
  assert.equal(isCompletedWorkBooking(amendment), false);

  console.log("OK  Upcoming / History / test exclusion matrix");
}

console.log("\n=== 3. Completion day grouping + legacy fallbacks ===");
{
  const jobA = {
    status: "confirmed",
    tripDate: "2026-08-20",
    tripTime: "08:00",
    journeyStatus: "completed",
    allLegsCompleted: true,
    journeyCompletedAt: "2026-08-20T09:15:00.000Z",
    paymentReference: "TAA-A",
    customerName: "A",
  };
  const jobB = {
    status: "confirmed",
    tripDate: "2026-08-20",
    tripTime: "11:00",
    journeyStatus: "completed",
    allLegsCompleted: true,
    journeyCompletedAt: "2026-08-20T12:00:00.000Z",
    paymentReference: "TAA-B",
    customerName: "B",
  };
  const jobC = {
    status: "confirmed",
    tripDate: "2026-08-19",
    tripTime: "10:00",
    journeyStatus: "completed",
    allLegsCompleted: true,
    journeyCompletedAt: "2026-08-19T11:00:00.000Z",
    paymentReference: "TAA-C",
    customerName: "C",
  };
  const legacyNoCompletedAt = {
    status: "confirmed",
    tripDate: "2026-08-18",
    tripTime: "14:30",
    journeyStatus: "completed",
    allLegsCompleted: true,
    paymentReference: "TAA-LEGACY",
    customerName: "Legacy",
  };
  const cancelled = {
    status: "cancelled",
    tripDate: "2026-08-22",
    tripTime: "09:00",
    cancelledAt: "2026-08-17T16:00:00.000Z",
    paymentReference: "TAA-CXL",
    customerName: "Cancelled",
  };

  assert.equal(resolveCompletionTimestamp(jobA)?.source, "journeyCompletedAt");
  assert.equal(resolveCompletionTimestamp(jobA)?.day, "2026-08-20");
  assert.equal(resolveCompletionTimestamp(legacyNoCompletedAt)?.source, "tripDateTime");
  assert.equal(resolveCompletionTimestamp(legacyNoCompletedAt)?.day, "2026-08-18");
  assert.equal(resolveCompletionTimestamp(cancelled)?.source, "cancelledAt");
  assert.equal(resolveCompletionTimestamp(cancelled)?.day, "2026-08-17");

  const history = [jobA, jobB, jobC, legacyNoCompletedAt, cancelled].filter(
    isCompletedWorkBooking,
  );
  assert.equal(history.length, 5, "no real booking lost from History");

  const groups = groupCompletedBookingsByDay(history, today);
  assert.equal(groups[0]?.day, "2026-08-20");
  assert.equal(groups[0]?.isToday, true);
  assert.equal(groups[0]?.items.length, 2);
  assert.equal(groups[0]?.items[0]?.paymentReference, "TAA-B", "newest within day first");
  assert.ok(groups[0]?.title.startsWith("Today —"));
  assert.equal(groups.find((g) => g.day === "2026-08-19")?.items[0]?.paymentReference, "TAA-C");
  assert.equal(groups.find((g) => g.day === "2026-08-18")?.items[0]?.paymentReference, "TAA-LEGACY");

  const withTest = [...history, {
    status: "confirmed",
    tripDate: "2026-08-20",
    journeyStatus: "completed",
    allLegsCompleted: true,
    isRefundTest: true,
    paymentReference: "REFUND-TEST-X",
  }];
  assert.equal(withTest.filter(isCompletedWorkBooking).length, 5);
  console.log("OK  day groups + journeyCompletedAt / tripDateTime / cancelledAt fallbacks");
}

console.log("\n=== 4. UI + worker wiring (source contracts) ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /groupCompletedBookingsByDay/);
  assert.match(panel, /isOwnerOperationalTestBooking/);
  assert.match(panel, /pastDays:\s*60/);
  assert.match(panel, /<details/);
  assert.match(panel, /open=\{group\.isToday\}/);
  assert.match(panel, /Completed Jobs/);

  const calendar = read("src/components/OwnerBookingCalendar.tsx");
  assert.match(calendar, /isOwnerOperationalTestBooking/);

  const handlers = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(handlers, /isOwnerOperationalTestBooking/);
  assert.match(handlers, /isRefundTest:/);
  assert.match(handlers, /isAmendmentTestFixture:/);

  const store = read("workers/addresses/src/paid-booking-store.ts");
  assert.match(store, /isOwnerOperationalTestBooking/);

  const shared = read("shared/upcoming-jobs.ts");
  const workerShared = read("workers/addresses/shared/upcoming-jobs.ts");
  assert.equal(shared, workerShared, "worker shared copy must stay in sync");

  console.log("OK  panel / calendar / handler / store / shared sync");
}

console.log("\nOwner dashboard job cleanup checks passed.");
