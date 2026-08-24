/**
 * Owner Dashboard daily-driver layout — Active jobs + primary journey CTAs +
 * collapsed Completed history. Offline source/unit checks only.
 * Run: npx tsx scripts/check-owner-daily-driver-layout.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OWNER_PRIMARY_JOURNEY_BUTTON_LABELS,
  groupOwnerScheduleByDay,
  isCompletedWorkBooking,
  isUpcomingWorkBooking,
  ownerUpcomingPrimaryJourneyActions,
} from "../shared/upcoming-jobs";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const today = "2026-08-24";

console.log("=== 1. Primary button order + labels ===");
{
  assert.deepEqual(
    Object.values(OWNER_PRIMARY_JOURNEY_BUTTON_LABELS),
    ["Driver on the way", "Driver arrived", "Complete job"],
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "idle",
      bookingStatus: "confirmed",
    }),
    ["start_tracking", "arrived_pickup", "complete_journey"],
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "tracking",
      bookingStatus: "confirmed",
    }),
    ["start_tracking", "arrived_pickup", "complete_journey"],
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "arrived_pickup",
      bookingStatus: "confirmed",
    }),
    ["start_tracking", "arrived_pickup", "complete_journey"],
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "completed",
      bookingStatus: "confirmed",
    }),
    [],
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "idle",
      bookingStatus: "cancelled",
    }),
    [],
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "idle",
      bookingStatus: "refunded",
    }),
    [],
  );
  console.log("OK  exact three-button order for active journeys");
}

console.log("\n=== 2. Active vs completed day grouping ===");
{
  const active = {
    status: "confirmed",
    tripDate: today,
    tripTime: "08:00",
    journeyStatus: "idle",
    customerName: "Customer A",
    paymentReference: "ACTIVE-A",
  };
  const tracking = {
    status: "confirmed",
    tripDate: today,
    tripTime: "11:30",
    journeyStatus: "tracking",
    customerName: "Customer B",
    paymentReference: "ACTIVE-B",
  };
  const completed = {
    status: "confirmed",
    tripDate: today,
    tripTime: "07:00",
    journeyStatus: "completed",
    allLegsCompleted: true,
    journeyCompletedAt: "2026-08-24T08:30:00.000Z",
    customerName: "Done C",
    paymentReference: "DONE-C",
  };
  const cancelled = {
    status: "cancelled",
    tripDate: today,
    tripTime: "09:00",
    journeyStatus: "idle",
    cancelledAt: "2026-08-24T09:15:00.000Z",
    customerName: "Cancel D",
    paymentReference: "CANCEL-D",
  };
  const refunded = {
    status: "refunded",
    tripDate: today,
    tripTime: "10:00",
    journeyStatus: "idle",
    refundedAt: "2026-08-24T10:15:00.000Z",
    customerName: "Refund E",
    paymentReference: "REFUND-E",
  };

  assert.equal(isUpcomingWorkBooking(active, today), true);
  assert.equal(isUpcomingWorkBooking(tracking, today), true);
  assert.equal(isUpcomingWorkBooking(completed, today), false);
  assert.equal(isUpcomingWorkBooking(cancelled, today), false);
  assert.equal(isUpcomingWorkBooking(refunded, today), false);
  assert.equal(isCompletedWorkBooking(completed), true);
  assert.equal(isCompletedWorkBooking(cancelled), true);
  assert.equal(isCompletedWorkBooking(refunded), true);
  assert.equal(isCompletedWorkBooking(active), false);

  const schedule = groupOwnerScheduleByDay(
    [active, tracking, completed, cancelled, refunded],
    today,
  );
  const day = schedule.find((g) => g.day === today);
  assert.ok(day);
  assert.equal(day!.upcoming.length, 2, "active jobs visible for selected day");
  assert.equal(day!.completed.length, 3, "completed/cancelled/refunded in history");
  assert.deepEqual(
    day!.upcoming.map((b) => b.paymentReference),
    ["ACTIVE-A", "ACTIVE-B"],
  );
  assert.ok(day!.completed.some((b) => b.paymentReference === "DONE-C"));
  assert.ok(day!.completed.some((b) => b.paymentReference === "CANCEL-D"));
  assert.ok(day!.completed.some((b) => b.paymentReference === "REFUND-E"));

  // Completing a job moves it out of active into same-day completed.
  const afterComplete = groupOwnerScheduleByDay(
    [
      { ...active, journeyStatus: "completed", journeyCompletedAt: "2026-08-24T09:00:00.000Z" },
      tracking,
      completed,
      cancelled,
      refunded,
    ],
    today,
  );
  const dayAfter = afterComplete.find((g) => g.day === today)!;
  assert.equal(dayAfter.upcoming.length, 1);
  assert.equal(dayAfter.upcoming[0]?.paymentReference, "ACTIVE-B");
  assert.equal(dayAfter.completed.length, 4);
  assert.ok(dayAfter.completed.some((b) => b.paymentReference === "ACTIVE-A"));
  console.log("OK  active visible · completed collapses by day · count updates");
}

console.log("\n=== 3. Owner panel UI contracts ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Active jobs/);
  assert.match(panel, /Completed jobs \(/);
  assert.match(panel, /More options ▼/);
  assert.match(panel, /Reassign driver/);
  assert.match(panel, /OwnerAssignDriverPanel/);
  assert.match(panel, /data-owner-primary-journey-controls/);
  assert.match(panel, /data-owner-more-options/);
  assert.match(panel, /data-owner-journey-action=\{item\.action\}/);
  assert.match(panel, /OWNER_PRIMARY_JOURNEY_BUTTON_LABELS/);
  assert.match(panel, /ownerUpcomingPrimaryJourneyActions/);
  assert.match(panel, /groupOwnerScheduleByDay/);
  assert.match(panel, /completedOpenDays/);
  assert.match(panel, /overflow-x-hidden/);
  assert.doesNotMatch(panel, /Status updates only/);
  assert.doesNotMatch(panel, /No driver GPS or live map tracking/);

  const shared = read("shared/upcoming-jobs.ts");
  assert.match(shared, /start_tracking:\s*"Driver on the way"/);
  assert.match(shared, /arrived_pickup:\s*"Driver arrived"/);
  assert.match(shared, /complete_journey:\s*"Complete job"/);
  assert.match(
    shared,
    /return \["start_tracking", "arrived_pickup", "complete_journey"\]/,
  );

  // Secondary controls collapsed by default (details, not open).
  assert.match(panel, /<details[\s\S]*?data-owner-more-options/);
  assert.doesNotMatch(panel, /data-owner-more-options[^>]*\sopen/);
  assert.doesNotMatch(panel, /Admin \/ More/);

  // No GPS / live-location UI reintroduced on Owner paid cards.
  assert.doesNotMatch(panel, /PaidBookingLiveTracking/);
  assert.doesNotMatch(panel, /Start Live Tracking/);
  assert.doesNotMatch(panel, /LIVE TRACKING ACTIVE/);
  assert.doesNotMatch(panel, /GPS Live/);
  assert.doesNotMatch(panel, /Open customer track link/);
  assert.doesNotMatch(panel, /SERVICE_FLAGS\.liveDriverTracking/);
  assert.doesNotMatch(panel, /postDriverLocation/);

  // Customer email / WhatsApp notifications remain wired for journey CTAs.
  assert.match(panel, /openOnTheWayWhatsAppForBooking/);
  assert.match(panel, /openArrivalWhatsAppForBooking/);
  assert.match(panel, /action === "start_tracking"/);
  assert.match(panel, /action === "arrived_pickup"/);
  assert.match(panel, /onTheWayNotificationStatus|Customer emailed \(Driver on the way\)/);
  assert.match(panel, /ownerPrimaryJourneyConfirmCopy/);
  assert.match(panel, /data-owner-journey-confirm=/);
  assert.match(panel, /gap-3\.5/);
  assert.match(panel, /min-h-14/);
  assert.match(panel, /bg-sky-400/);
  assert.match(panel, /bg-amber-300/);

  const shortNotice = read("src/components/OwnerShortNoticePanel.tsx");
  assert.match(shortNotice, /View \/ Manage ▼/);
  assert.match(shortNotice, /View \/ Manage ▲/);
  assert.match(shortNotice, /data-owner-sn-card="collapsed"/);
  assert.match(shortNotice, /expandedRefs/);
  assert.match(shortNotice, /AWAITING OWNER APPROVAL/);
  assert.match(shortNotice, /AWAITING CUSTOMER RESPONSE/);
  assert.match(shortNotice, /APPROVED — AWAITING PAYMENT/);
  assert.match(shortNotice, /Remove from dashboard/);
  assert.match(shortNotice, /Archived \/ Removed bookings/);
  assert.match(shortNotice, /SHORT_NOTICE_ALTERNATIVE_DECLINED/);

  const data = read("src/lib/data.ts");
  assert.match(data, /liveDriverTracking:\s*false/);

  const workerShared = read("workers/addresses/shared/upcoming-jobs.ts");
  assert.equal(shared, workerShared, "worker shared copy must stay in sync");

  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /Active jobs/);
  assert.match(page, /Completed jobs \(/);

  console.log("OK  Active/Completed UI · More options · pending collapse · no GPS live UI");
}

console.log("\nOwner daily-driver layout checks passed.");
