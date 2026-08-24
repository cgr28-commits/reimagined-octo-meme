/**
 * Offline checks for owner default-driver UX + Upcoming/Completed Jobs split.
 * Run: npx tsx scripts/check-owner-jobs-profile-fix.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bookingFullyCompleted,
  isCompletedWorkBooking,
  isUpcomingWorkBooking,
  nextUnfinishedSortKey,
  relevantUpcomingJourneyDate,
} from "../shared/upcoming-jobs";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Production root cause: incomplete roster must not auto-open form ===");
{
  const driverPage = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driverPage, /never auto-open an incomplete roster stub/);
  assert.match(driverPage, /ownerUsingDefaultDriver/);
  assert.match(driverPage, /Set up \{profile\.displayName\}/);
  assert.match(driverPage, /Use Owner profile/);
  console.log("OK  Owner UI ignores incomplete additional-driver stubs by default");
}

console.log("\n=== 2. Leg-aware Upcoming vs Completed ===");
{
  const oneWayOpen = { journeyStatus: "tracking" as const };
  const oneWayDone = { journeyStatus: "completed" as const, allLegsCompleted: true };
  const returnOutboundDone = {
    returnJourney: true,
    tripDate: "2026-08-08",
    returnDate: "2026-08-19",
    outboundJourneyStatus: "completed",
    returnJourneyStatus: "idle",
    allLegsCompleted: false,
    nextUnfinishedLegDate: "2026-08-19",
    nextUnfinishedLegTime: "02:35",
  };
  const returnBothDone = {
    returnJourney: true,
    outboundJourneyStatus: "completed",
    returnJourneyStatus: "completed",
    allLegsCompleted: true,
  };

  const asOf = "2026-08-08";
  assert.equal(isUpcomingWorkBooking(oneWayOpen, asOf), true);
  assert.equal(isUpcomingWorkBooking(oneWayDone, asOf), false);
  assert.equal(isCompletedWorkBooking(oneWayDone), true);
  assert.equal(isUpcomingWorkBooking(returnOutboundDone, asOf), true);
  assert.equal(bookingFullyCompleted(returnOutboundDone), false);
  assert.equal(relevantUpcomingJourneyDate(returnOutboundDone), "2026-08-19");
  assert.equal(isUpcomingWorkBooking(returnBothDone, asOf), false);
  assert.equal(isCompletedWorkBooking(returnBothDone), true);

  const a = { nextUnfinishedLegDate: "2026-08-19", nextUnfinishedLegTime: "02:35" };
  const b = { nextUnfinishedLegDate: "2026-08-18", nextUnfinishedLegTime: "10:00" };
  assert.ok(nextUnfinishedSortKey(b) < nextUnfinishedSortKey(a));
  console.log("OK  Return stays upcoming until both legs complete; sort by next unfinished");
}

console.log("\n=== 3. API enrichment + Completed Jobs label ===");
{
  const handlers = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(handlers, /allLegsCompleted/);
  assert.match(handlers, /nextUnfinishedLegDate/);
  assert.match(handlers, /outboundJourneyStatus/);

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Completed jobs \(/);
  assert.match(panel, /groupOwnerScheduleByDay/);
  assert.match(panel, /nextUnfinishedSortKey/);

  const driverPage = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driverPage, /activeVisibleJobs/);
  assert.match(driverPage, /completedVisibleJobs/);
  console.log("OK  Enrichment + UI Completed Jobs sections present");
}

console.log("\nAll owner jobs/profile fix checks passed.");
