/**
 * Offline checks: SumUp return legs appear on return date in Owner jobs.
 * Does not call live APIs or mutate KV.
 * Run: npx tsx scripts/check-return-leg-tracking.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bookingInUpcomingHorizon,
  relevantUpcomingJourneyDate,
  upcomingBucketForTripDate,
} from "../shared/upcoming-jobs";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Horizon + relevant date helpers (Pamela-shaped return) ===");
{
  const pamela = {
    tripDate: "2026-08-08",
    tripTime: "12:15",
    returnJourney: true,
    returnDate: "2026-08-19",
    returnTime: "02:35",
  };
  const today = "2026-08-17";
  assert.equal(relevantUpcomingJourneyDate(pamela, today), "2026-08-19");
  assert.equal(upcomingBucketForTripDate(relevantUpcomingJourneyDate(pamela, today), today), "later");
  assert.equal(
    bookingInUpcomingHorizon(pamela, "2026-08-15", "2026-11-15"),
    true,
    "return date keeps paid booking in Upcoming horizon after outbound has left pastDays window",
  );
  assert.equal(bookingInUpcomingHorizon({ tripDate: "2026-08-01" }, "2026-08-15", "2026-11-15"), false);
  assert.equal(
    relevantUpcomingJourneyDate(
      { tripDate: "2026-08-20", returnJourney: true, returnDate: "2026-08-25" },
      today,
    ),
    "2026-08-20",
    "while outbound is still ahead, bucket by outbound",
  );
  console.log("OK  Pamela return buckets under Later on 19 Aug; horizon includes returnDate");
}

console.log("\n=== 2. Backfill uses paid booking records (SumUp), not only booking-jobs ===");
{
  const handlers = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(handlers, /paidBookingDetailsForReturnBackfill/);
  assert.match(handlers, /getPaidBookingRecord/);
  assert.match(handlers, /listPaymentRefsWithReturnDateInRange/);
  assert.match(handlers, /backfillReturnTrackingLegs\(env\.TRACKING_STORE, seed, paidReturnRefs\)/);
  // Must not gate the whole backfill on booking-job store only.
  assert.doesNotMatch(
    handlers,
    /async function backfillReturnTrackingLegs[\s\S]*?if \(!bookingJobStoreConfigured\(store\)\) \{\s*return;/,
  );
  console.log("OK  Owner jobs backfill seeds SumUp paid returns");
}

console.log("\n=== 3. Ensure-tracking creates missing return leg ===");
{
  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /returnLegCreated/);
  assert.match(journey, /findTrackingJobsByPaymentReference/);
  assert.match(
    journey,
    /missing return leg is created even if the outbound token is already set/,
  );
  console.log("OK  ensure-tracking no longer early-returns before return-leg create");
}

console.log("\n=== 4. Upcoming Jobs merge + list ===");
{
  const paidHandlers = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(paidHandlers, /Return legs alone must not invent a synthetic/);
  assert.match(paidHandlers, /Prefer return leg for live status/);
  assert.doesNotMatch(
    paidHandlers,
    /for \(const job of trackJobs\) \{\s*if \(job\.journeyLeg === "return"\) continue;/,
  );

  const store = read("workers/addresses/src/paid-booking-store.ts");
  assert.match(store, /bookingInUpcomingHorizon/);
  assert.match(store, /listPaymentRefsWithReturnDateInRange/);

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /relevantUpcomingJourneyDate/);
  console.log("OK  Upcoming list/UI include return-date visibility");
}

console.log("\nAll return-leg tracking checks passed.");
