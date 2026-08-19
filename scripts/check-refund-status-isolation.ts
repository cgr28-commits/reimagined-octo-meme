/**
 * Regression: refunding Booking A must never mutate Booking B's tracking job
 * or calendar status when A only shares a stale pairedToken / fuzzy day match.
 *
 * Run: npx tsx scripts/check-refund-status-isolation.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  deriveCalendarLegStatus,
  defaultOwnerCalendarView,
  defaultMobileCalendarView,
  CALENDAR_STATUS_STYLES,
  mergeCalendarEntries,
} from "../src/lib/owner-booking-calendar";
import type { DriverJob } from "../src/lib/tracking-api";
import type { OwnerPaidBookingSummary } from "../src/lib/paid-bookings-api";
import { selectTrackingJobsForRefundMark } from "../shared/tracking";
import type { TrackingJobRecord } from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function baseJob(
  overrides: Partial<TrackingJobRecord> & Pick<TrackingJobRecord, "token" | "paymentReference">,
): TrackingJobRecord {
  return {
    createdAt: "2026-08-19T10:00:00.000Z",
    customerName: "Test Customer",
    customerMobile: "07700900000",
    pickupLabel: "Pickup",
    dropoffLabel: "Dropoff",
    tripDate: "2026-08-23",
    tripTime: "11:30",
    pickupAt: "2026-08-23T11:30",
    sharingActive: false,
    journeyStatus: "idle",
    ...overrides,
  };
}

console.log("=== 1. pairedToken with different paymentReference is ignored ===");
{
  const bookingA = baseJob({
    token: "token-a",
    paymentReference: "PAY-TEST-A",
    customerName: "TEST MANAGE BOOKING",
    tripDate: "2026-08-20",
    tripTime: "09:00",
    pickupAt: "2026-08-20T09:00",
    pairedToken: "token-b",
  });
  const bookingB = baseJob({
    token: "token-b",
    paymentReference: "PAY-JILL-B",
    customerName: "Jill Matchett",
    tripDate: "2026-08-23",
    tripTime: "11:30",
    pickupAt: "2026-08-23T11:30",
    pairedToken: "token-a",
  });

  const selected = selectTrackingJobsForRefundMark({
    primary: bookingA,
    relatedByPaymentRef: [bookingA],
    pairedJob: bookingB,
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.token, "token-a");
  assert.ok(!selected.some((job) => job.token === "token-b"));
  console.log("OK  refund fan-out does not include foreign pairedToken");
}

console.log("\n=== 2. Same paymentReference legs ARE both marked ===");
{
  const outbound = baseJob({
    token: "token-out",
    paymentReference: "PAY-RETURN",
    journeyLeg: "outbound",
    pairedToken: "token-ret",
  });
  const ret = baseJob({
    token: "token-ret",
    paymentReference: "PAY-RETURN",
    journeyLeg: "return",
    pairedToken: "token-out",
    tripDate: "2026-08-24",
    tripTime: "18:00",
    pickupAt: "2026-08-24T18:00",
  });
  const selected = selectTrackingJobsForRefundMark({
    primary: outbound,
    relatedByPaymentRef: [outbound, ret],
    pairedJob: ret,
  });
  assert.equal(selected.length, 2);
  assert.ok(selected.some((job) => job.token === "token-out"));
  assert.ok(selected.some((job) => job.token === "token-ret"));
  console.log("OK  genuine outbound/return pair with same paymentReference still linked");
}

console.log("\n=== 3. Calendar: refund A does not complete B ===");
{
  const jobA = {
    token: "token-a",
    paymentReference: "PAY-TEST-A",
    customerName: "TEST MANAGE BOOKING",
    customerMobile: "07000000001",
    pickupLabel: "A pickup",
    dropoffLabel: "A dropoff",
    tripDate: "2026-08-20",
    tripTime: "09:00",
    pickupAt: "2026-08-20T09:00",
    sharingActive: false,
    journeyStatus: "idle",
    bookingStatus: "refunded",
    ok: true,
    pickupDisplay: "A pickup",
    trackingWindow: { open: false },
    customerSharingActive: false,
    trackUrl: "",
    driver: null,
  } as unknown as DriverJob;
  const jobB = {
    token: "token-b",
    paymentReference: "PAY-JILL-B",
    customerName: "Jill Matchett",
    customerMobile: "07000000002",
    pickupLabel: "B pickup",
    dropoffLabel: "BFS",
    tripDate: "2026-08-23",
    tripTime: "11:30",
    pickupAt: "2026-08-23T11:30",
    sharingActive: false,
    journeyStatus: "idle",
    bookingStatus: "confirmed",
    ok: true,
    pickupDisplay: "B pickup",
    trackingWindow: { open: false },
    customerSharingActive: false,
    trackUrl: "",
    driver: null,
  } as unknown as DriverJob;
  const bookingA = {
    paymentReference: "PAY-TEST-A",
    customerName: "TEST MANAGE BOOKING",
    status: "refunded",
    tripDate: "2026-08-20",
    tripTime: "09:00",
    pickupLabel: "A pickup",
    dropoffLabel: "A dropoff",
    vehicle: "Saloon",
  } as OwnerPaidBookingSummary;
  const bookingB = {
    paymentReference: "PAY-JILL-B",
    customerName: "Jill Matchett",
    status: "confirmed",
    tripDate: "2026-08-23",
    tripTime: "11:30",
    pickupLabel: "B pickup",
    dropoffLabel: "BFS",
    vehicle: "Saloon",
  } as OwnerPaidBookingSummary;

  const entries = mergeCalendarEntries([jobA, jobB], [bookingA, bookingB]);
  const entryA = entries.find((e) => e.paymentReference === "PAY-TEST-A");
  const entryB = entries.find((e) => e.paymentReference === "PAY-JILL-B");
  assert.ok(entryA);
  assert.ok(entryB);
  assert.equal(entryA!.calendarStatus, "refunded");
  assert.equal(entryB!.calendarStatus, "upcoming");
  assert.notEqual(entryB!.calendarStatus, "completed");
  assert.notEqual(entryB!.calendarStatus, "refunded");

  // Simulate the bug symptom if B were wrongly stamped refundedAt → bookingStatus refunded
  assert.equal(
    deriveCalendarLegStatus({
      bookingStatus: "confirmed",
      journeyStatus: "idle",
      sharingActive: false,
    }),
    "upcoming",
  );
  assert.equal(
    deriveCalendarLegStatus({
      bookingStatus: "refunded",
      journeyStatus: "idle",
      sharingActive: false,
    }),
    "refunded",
  );
  assert.equal(
    deriveCalendarLegStatus({
      bookingStatus: "confirmed",
      journeyStatus: "completed",
      sharingActive: false,
    }),
    "completed",
  );
  console.log("OK  Booking B stays upcoming after Booking A is refunded");
}

console.log("\n=== 4. Calendar legend / Month default ===");
{
  assert.equal(defaultOwnerCalendarView(), "month");
  assert.equal(defaultMobileCalendarView(), "month");
  assert.equal(CALENDAR_STATUS_STYLES.live.label, "Driver on the way");
  assert.equal(CALENDAR_STATUS_STYLES.arrived_pickup.label, "Arrived at Pickup");
  assert.notEqual(CALENDAR_STATUS_STYLES.live.label, "Live tracking");
  console.log("OK  Month default + Driver on the way legend (Arrived kept)");
}

console.log("\n=== 5. Source wiring ===");
{
  const shared = read("shared/tracking.ts");
  assert.match(shared, /selectTrackingJobsForRefundMark/);
  const store = read("workers/addresses/src/tracking-store.ts");
  assert.match(store, /selectTrackingJobsForRefundMark/);
  assert.match(store, /Never fuzzy-match by customer name/);
  assert.doesNotMatch(
    store,
    /job\.customerName\.trim\(\)\.toLowerCase\(\) === booking\.customerName/,
  );

  const refund = read("workers/addresses/src/refund-handlers.ts");
  assert.match(refund, /paymentReference mismatch \(not mutating other booking\)/);
  assert.match(refund, /findTrackingJobsByPaymentReference/);

  const cal = read("src/lib/owner-booking-calendar.ts");
  assert.match(cal, /label: "Driver on the way"/);
  assert.match(cal, /label: "Arrived at Pickup"/);
  console.log("OK  refund isolation + calendar copy wired");
}

console.log("\nAll refund status isolation checks passed.");
