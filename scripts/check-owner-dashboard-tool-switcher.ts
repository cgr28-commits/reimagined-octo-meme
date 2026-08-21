/**
 * Owner Dashboard — top tool switcher + Flight Status wiring.
 * Offline only: no SumUp, Resend, AeroDataBox, or KV.
 * Run: npx tsx scripts/check-owner-dashboard-tool-switcher.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  categorizeFlightStatus,
  flightStatusAutoRefreshMs,
  flightStatusCacheMaxAgeSeconds,
  formatFlightNumberForDisplay,
  preferFlightStatusSnapshot,
  resolveFlightStatusFromTimes,
  shouldBypassStaleFlightCache,
  type VerifiedFlight,
} from "../shared/flight-lookup";
import { decideDriverFlightAlert } from "../shared/driver-flight-alerts";
import {
  ownerFlightCompactSummary,
  resolveOwnerFlightLegContext,
} from "../shared/owner-flight-status";
import {
  isOwnerOperationalTestBooking,
  isUpcomingWorkBooking,
  ownerUpcomingPrimaryJourneyActions,
} from "../shared/upcoming-jobs";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Top switcher — Jobs default, exclusive panels ===");
{
  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  assert.match(switcher, /OwnerDashboardToolTab/);
  assert.match(switcher, /"jobs"/);
  assert.match(switcher, /"personal-quotes"/);
  assert.match(switcher, /"same-fare"/);
  assert.match(switcher, /role="tablist"/);
  assert.match(switcher, /aria-selected/);

  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerDashboardToolSwitcher/);
  assert.match(
    page,
    /useState<OwnerDashboardToolTab>\("jobs"\)/,
    "Jobs is the default top selection",
  );
  assert.match(page, /ownerToolTab === "personal-quotes"/);
  assert.match(page, /ownerToolTab === "same-fare"/);
  assert.match(
    page,
    /ownerToolTab === "jobs"/,
    "Jobs view gated by top selection",
  );
  assert.match(page, /OwnerPersonalQuotesPanel/);
  assert.match(page, /OwnerAmendmentTestPanel/);

  // Personal Quotes / Same Fare only render when their tab is selected (not always-on).
  const pqAlways =
    /isOwnerView && savedKey \? \(\s*<OwnerPersonalQuotesPanel/.test(page);
  const sfAlways =
    /isOwnerView && savedKey \? \(\s*<OwnerAmendmentTestPanel/.test(page);
  assert.equal(pqAlways, false, "Personal Quotes must not always render");
  assert.equal(sfAlways, false, "Same Fare Test must not always render");

  // Returning to Jobs collapses both tools (exclusive tab).
  assert.ok(
    page.includes('ownerToolTab === "personal-quotes"') &&
      page.includes('ownerToolTab === "same-fare"') &&
      page.includes('ownerToolTab === "jobs"'),
    "only one owner tool section expanded at a time",
  );
  console.log("OK  Jobs default · exclusive Personal Quotes / Same Fare / Jobs");
}

console.log("\n=== 2. Operational Jobs cleanup still intact ===");
{
  const today = "2026-08-20";
  const real = {
    status: "confirmed",
    tripDate: "2026-08-25",
    tripTime: "10:00",
    journeyStatus: "idle",
    paymentReference: "TAA-REAL-001",
  };
  const testBooking = {
    ...real,
    paymentReference: "REFUND-TEST-HIDDEN",
    isRefundTest: true,
  };
  assert.equal(isUpcomingWorkBooking(real, today), true, "real upcoming remains visible");
  assert.equal(isOwnerOperationalTestBooking(testBooking), true);
  assert.equal(
    isUpcomingWorkBooking(testBooking, today),
    false,
    "tests remain hidden from upcoming",
  );
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "idle",
      sharingActive: false,
      bookingStatus: "confirmed",
    }),
    ["start_tracking", "arrived_pickup"],
    "Driver on the way + Driver has arrived remain available",
  );
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /JOURNEY_ACTION_LABELS/);
  assert.match(panel, /ownerUpcomingPrimaryJourneyActions/);
  console.log("OK  real upcoming · tests hidden · journey CTAs");
}

console.log("\n=== 3. Flight tracker eligibility ===");
{
  const airportPickup = resolveOwnerFlightLegContext({
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "12 High Street, Belfast",
    tripDate: "2026-08-25",
    tripTime: "14:00",
    flightNumber: "BA1416",
    airportCode: "BFS",
    isFromAirport: true,
  });
  assert.equal(airportPickup.showFlightTracker, true);
  assert.equal(airportPickup.missingFlightNumber, false);
  assert.equal(airportPickup.flightNumber, "BA1416");
  assert.equal(airportPickup.direction, "from-airport");

  const noFlight = resolveOwnerFlightLegContext({
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "12 High Street, Belfast",
    tripDate: "2026-08-25",
    isFromAirport: true,
    flightNumber: "",
    airportCode: "BFS",
  });
  assert.equal(noFlight.showFlightTracker, true);
  assert.equal(noFlight.missingFlightNumber, true);

  const toAirport = resolveOwnerFlightLegContext({
    pickupLabel: "12 High Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    tripDate: "2026-08-25",
    flightNumber: "BA1416",
    airportCode: "BFS",
    isFromAirport: false,
  });
  assert.equal(
    toAirport.showFlightTracker,
    false,
    "journey to airport does not show unnecessary tracker",
  );

  const a2aMisTagged = resolveOwnerFlightLegContext({
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "George Best Belfast City Airport",
    tripDate: "2026-08-25",
    flightNumber: "BA1416",
    airportCode: "BHD",
    isFromAirport: false,
  });
  assert.equal(
    a2aMisTagged.showFlightTracker,
    true,
    "A2A with airport pickup shows tracker even if isFromAirport was false",
  );
  assert.equal(a2aMisTagged.airportCode, "BFS", "uses pickup airport code for A2A");
  assert.equal(a2aMisTagged.flightNumber, "BA1416");

  const returnPickup = resolveOwnerFlightLegContext(
    {
      pickupLabel: "12 High Street, Belfast",
      dropoffLabel: "Dublin Airport",
      tripDate: "2026-08-20",
      returnDate: "2026-08-25",
      returnJourney: true,
      outboundJourneyStatus: "completed",
      nextUnfinishedLegDate: "2026-08-25",
      flightNumber: "EI123",
      returnFlightNumber: "EI456",
      airportCode: "DUB",
      isFromAirport: false,
    },
    "2026-08-20",
  );
  assert.equal(returnPickup.showFlightTracker, true);
  assert.equal(returnPickup.isReturnLeg, true);
  assert.equal(
    returnPickup.flightNumber,
    "EI456",
    "return airport-pickup leg uses returnFlightNumber",
  );

  console.log("OK  airport pickup / missing number / to-airport / return flight");
}

console.log("\n=== 4. Flight Status UI + auto-refresh ===");
{
  const panel = read("src/components/OwnerFlightStatusPanel.tsx");
  assert.match(panel, /Refresh Flight/);
  assert.match(panel, /No flight number supplied/);
  assert.match(panel, /Flight Status/);
  assert.match(panel, /lookupFlightForBooking/);
  assert.match(panel, /refresh/);
  assert.match(panel, /flightStatusAutoRefreshMs/);
  assert.match(panel, /shouldBypassStaleFlightCache/);
  assert.match(panel, /preferFlightStatusSnapshot/);
  assert.match(panel, /Last updated/);
  assert.match(panel, /Live aircraft position currently unavailable/);
  assert.match(
    panel,
    /flight\.position\.lat/,
    "live map only renders when provider lat/lng exist",
  );

  const paid = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(paid, /OwnerFlightStatusPanel/);
  assert.match(
    paid,
    /!isClosed \? \(\s*<OwnerFlightStatusPanel/,
    "Flight Status must render on main card even when journey is completed",
  );
  assert.doesNotMatch(
    paid,
    /!isClosed && !isCompleted \? \(\s*<OwnerFlightStatusPanel/,
    "must not hide Flight Status solely because journeyStatus is completed",
  );

  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerFlightStatusPanel/);
  assert.doesNotMatch(page, /DriverFlightPanel/);

  assert.equal(formatFlightNumberForDisplay("RK159"), "RK 159");
  assert.equal(
    ownerFlightCompactSummary({
      flightNumber: "BA 1416",
      statusLabel: "DELAYED",
      delayMinutes: 24,
      estimatedTime: "18:42",
    }),
    "BA 1416 · Delayed 24 min · ETA 18:42",
  );

  assert.equal(categorizeFlightStatus("Expected", 0).statusLabel, "ON TIME");
  assert.equal(categorizeFlightStatus("Delayed", 24).statusLabel, "DELAYED");
  assert.equal(categorizeFlightStatus("Landed", null).statusLabel, "LANDED");
  assert.equal(categorizeFlightStatus("Cancelled", null).statusLabel, "CANCELLED");
  assert.equal(
    categorizeFlightStatus("Delayed", 134, { actualTime: "22:31" }).statusLabel,
    "LANDED",
    "actual arrival beats stale delayed label",
  );
  assert.equal(
    categorizeFlightStatus("Departed", 134, {
      bestArrivalIso: "22:29",
      tripDate: "2026-08-20",
      nowMs: Date.parse("2026-08-21T00:30:00Z"),
    }).statusLabel,
    "ARRIVAL PENDING",
    "past ETA with no actual → arrival pending (not DELAYED)",
  );

  // Regression: scheduled + estimated + actual + delayed data → LANDED + ACTUAL
  const landedResolved = resolveFlightStatusFromTimes({
    rawStatus: "Delayed",
    tripDate: "2026-08-20",
    scheduledTime: "20:15",
    estimatedTime: "22:29",
    actualTime: "22:31",
    nowMs: Date.parse("2026-08-21T00:30:00Z"),
  });
  assert.equal(landedResolved.statusCategory, "landed");
  assert.equal(landedResolved.statusLabel, "LANDED");
  assert.equal(landedResolved.actualTime, "22:31");
  assert.equal(landedResolved.arrivalConfirmationPending, false);
  assert.notEqual(landedResolved.statusCategory, "delayed");

  const pendingResolved = resolveFlightStatusFromTimes({
    rawStatus: "Departed",
    tripDate: "2026-08-20",
    scheduledTime: "20:15",
    estimatedTime: "22:29",
    actualTime: null,
    nowMs: Date.parse("2026-08-21T00:30:00Z"),
  });
  assert.equal(pendingResolved.statusCategory, "arrival_pending");
  assert.equal(pendingResolved.arrivalConfirmationPending, true);

  const delayed: VerifiedFlight = {
    flightNumber: "RK 159",
    airline: "Ryanair",
    date: "2026-08-20",
    scheduledTime: "20:15",
    scheduledTimeLabel: "Arrives",
    airportCode: "BFS",
    airportName: "Belfast International",
    departureAirport: "STN",
    arrivalAirport: "BFS",
    statusCategory: "delayed",
    statusLabel: "DELAYED",
    estimatedTime: "22:29",
    delayMinutes: 134,
  };
  const landed: VerifiedFlight = {
    ...delayed,
    statusCategory: "landed",
    statusLabel: "LANDED",
    actualTime: "22:31",
  };
  assert.equal(
    preferFlightStatusSnapshot(landed, delayed).statusCategory,
    "landed",
    "stale delayed cache cannot override landed",
  );
  assert.equal(
    preferFlightStatusSnapshot(delayed, landed).statusCategory,
    "landed",
    "incoming landed wins over delayed",
  );
  assert.equal(
    shouldBypassStaleFlightCache({
      statusCategory: "delayed",
      date: "2020-01-01",
      estimatedTime: "12:00",
    }),
    true,
    "ETA passed triggers final-status refresh",
  );
  assert.equal(
    shouldBypassStaleFlightCache({
      statusCategory: "landed",
      date: "2020-01-01",
      estimatedTime: "12:00",
      actualTime: "12:05",
    }),
    false,
    "landed does not need stale-cache bypass",
  );
  assert.equal(
    flightStatusAutoRefreshMs({
      statusCategory: "landed",
      tripDate: "2026-08-20",
      scheduledTime: "20:15",
      actualTime: "22:31",
    }),
    0,
    "landed flight stops polling",
  );
  assert.ok(
    flightStatusAutoRefreshMs({
      statusCategory: "delayed",
      tripDate: "2099-01-01",
      scheduledTime: "12:00",
    }) >= 10 * 60 * 1000,
    "far-away flights refresh infrequently",
  );

  const flightPanelSrc = read("src/components/OwnerFlightStatusPanel.tsx");
  assert.match(flightPanelSrc, /Arrival confirmation pending/);
  assert.match(flightPanelSrc, /Actual arrival/);

  console.log("OK  compact UI · landed priority · cache lock · auto-refresh");
}

console.log("\n=== 4b. GPS live labels hidden · driver alerts dedupe ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.doesNotMatch(panel, /Paid · Tracking live/);
  assert.match(panel, /liveDriverTracking/);

  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /SERVICE_FLAGS\.liveDriverTracking && job\.sharingActive/);
  assert.doesNotMatch(
    page,
    /\{job\.sharingActive \? " · GPS live" : ""\}/,
  );

  const first = decideDriverFlightAlert({
    flightNumber: "RK159",
    statusCategory: "delayed",
    delayMinutes: 134,
    estimatedTime: "22:29",
    previous: null,
  });
  assert.equal(first.send, true);
  const dupe = decideDriverFlightAlert({
    flightNumber: "RK159",
    statusCategory: "delayed",
    delayMinutes: 134,
    estimatedTime: "22:29",
    previous: first.send ? first.nextSnapshot : null,
  });
  assert.equal(dupe.send, false, "duplicate delay alert prevented");

  const flightPanel = read("src/components/OwnerFlightStatusPanel.tsx");
  assert.match(flightPanel, /Watch Live/);
  assert.match(flightPanel, /flightStatusAutoRefreshMs/);
  assert.match(flightPanel, /Live aircraft position currently unavailable/);
  console.log("OK  GPS labels gated · alert dedupe · Watch Live");
}

console.log("\n=== 5. Caching + credentials stay server-side ===");
{
  assert.ok(flightStatusCacheMaxAgeSeconds({
    tripDate: "2099-01-01",
    statusCategory: "on_time",
    scheduledTime: "12:00",
  }) >= 3600, "far-away flights cache longer");
  assert.equal(
    flightStatusCacheMaxAgeSeconds({
      tripDate: "2020-01-01",
      statusCategory: "landed",
      scheduledTime: "12:00",
    }),
    60 * 60 * 12,
    "landed stops frequent updating",
  );

  const worker = read("workers/addresses/src/index.ts");
  assert.match(worker, /flightStatusCacheMaxAgeSeconds/);
  assert.match(worker, /shouldBypassStaleFlightCache/);
  assert.match(worker, /refresh/);
  assert.match(worker, /AERODATABOX_RAPIDAPI_KEY/);

  const alertHandler = read("workers/addresses/src/driver-flight-alert-handlers.ts");
  assert.match(alertHandler, /decideDriverFlightAlert/);
  assert.match(alertHandler, /trySendEmail/);
  assert.doesNotMatch(alertHandler, /AERODATABOX|RAPIDAPI/);

  const tracking = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(
    tracking,
    /Flight status is on-demand|never auto-fetch/,
    "job list must not call AeroDataBox repeatedly",
  );
  assert.doesNotMatch(tracking, /await lookupFlight\(/);

  const clientLib = read("src/lib/flight-lookup.ts");
  assert.doesNotMatch(clientLib, /AERODATABOX|RAPIDAPI|OWNER_ACCESS_KEY/);
  assert.match(clientLib, /refresh/);

  const flightPanel = read("src/components/OwnerFlightStatusPanel.tsx");
  assert.doesNotMatch(flightPanel, /AERODATABOX_RAPIDAPI|RAPIDAPI_KEY|OWNER_ACCESS_KEY/);

  const switcherSrc = read("src/components/OwnerDashboardToolSwitcher.tsx");
  assert.doesNotMatch(switcherSrc, /AERODATABOX|RAPIDAPI|OWNER_ACCESS_KEY/);

  console.log("OK  adaptive cache · no client credentials · no list auto-fetch");
}

console.log("\n=== 6. Preview CORS helpers remain ===");
{
  const cors = read("shared/google-places.ts");
  assert.match(cors, /isVercelProjectPreviewHost/);
  assert.match(cors, /my-airport-taxi-ni-quote/);
  console.log("OK  Vercel preview origin allowlist");
}

console.log("\nAll owner dashboard tool-switcher + flight status checks passed.");
