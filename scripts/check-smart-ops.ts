/**
 * Smart Availability + Smart Return Pricing — cases A–Q.
 * Live customer flags stay off. Run: npx tsx scripts/check-smart-ops.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_SMART_OPS_CONFIG,
  SMART_OPS_REASON,
  customerFacingSmartOpsEnabled,
  normalizeSmartOpsConfig,
} from "../shared/smart-ops-config";
import {
  expandSmartAvailabilityIntervals,
  findBlockingSmartInterval,
  normalizeSmartAvailabilityException,
  normalizeSmartAvailabilityRule,
} from "../shared/smart-availability";
import {
  evaluateSmartAvailability,
  type SmartOccupiedJob,
} from "../shared/smart-conflict";
import {
  evaluateSmartReturn,
  reassessSmartReturnAfterParentCancel,
  type SmartReturnParent,
} from "../shared/smart-return";
import { evaluateSmartOpsShadow } from "../shared/smart-shadow";
import { UNIVERSAL_ESTATE_PREMIUM_GBP } from "../shared/universal-distance-pricing";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const BFS = { lat: 54.6575, lng: -6.2158 };
const BELFAST = { lat: 54.5964, lng: -5.9302 };
const DUB = { lat: 53.4264, lng: -6.2499 };
const NEWRY = { lat: 54.175, lng: -6.337 };
const GALWAY = { lat: 53.2707, lng: -9.0568 };

const NOW = new Date("2026-09-06T12:00:00+01:00");
const MONDAY = "2026-09-07";
const NEXT_MONDAY = "2026-09-14";

const config = normalizeSmartOpsConfig({
  ...DEFAULT_SMART_OPS_CONFIG,
  flags: {
    ...DEFAULT_SMART_OPS_CONFIG.flags,
    smartAvailability: false,
    alternativeTimeSuggestions: false,
    smartReturnPricing: false,
    returnCorridorMatching: true,
    shadowMode: true,
  },
  smartReturn: {
    ...DEFAULT_SMART_OPS_CONFIG.smartReturn,
    releaseMode: "immediately",
    minAcceptableFareGbp: 40,
    maxDiscountPercent: 35,
    maxDeviationMiles: 10,
    returnTimeFlexibilityMinutes: 45,
  },
});

const mondayRule = normalizeSmartAvailabilityRule({
  id: "rule-mon",
  kind: "recurring",
  weekdays: [1],
  startTime: "13:00",
  endTime: "15:00",
  enabled: true,
});
assert.ok(mondayRule);

console.log("=== A. Recurring Monday block ===");
{
  const intervals = expandSmartAvailabilityIntervals({
    rules: [mondayRule],
    fromYmd: MONDAY,
    toYmd: NEXT_MONDAY,
  });
  assert.ok(findBlockingSmartInterval(MONDAY, "14:00", intervals));
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "14:00",
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [mondayRule],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  assert.equal(decision.reason, SMART_OPS_REASON.BLOCKED_RECURRING_AVAILABILITY);
  console.log("OK  A");
}

console.log("\n=== B. One Monday exception ===");
{
  const exception = normalizeSmartAvailabilityException({
    id: "ex-1",
    ruleId: mondayRule.id,
    date: MONDAY,
    kind: "available",
  });
  assert.ok(exception);
  const open = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "14:00",
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [mondayRule],
    exceptions: [exception],
    config,
    searchAlternatives: false,
  });
  assert.equal(open.available, true);
  const later = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: NEXT_MONDAY,
      tripTime: "14:00",
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [mondayRule],
    exceptions: [exception],
    config,
    searchAlternatives: false,
  });
  assert.equal(later.available, false);
  console.log("OK  B");
}

const bfsToCity: SmartOccupiedJob = {
  id: "JOB-BFS-CITY",
  pickupLabel: "Belfast International Airport",
  dropoffLabel: "Belfast City Centre",
  pickup: BFS,
  dropoff: BELFAST,
  tripDate: MONDAY,
  tripTime: "10:00",
  durationMinutes: 25,
  airportCode: "BFS",
  isFromAirport: true,
};

console.log("\n=== C. Compatible consecutive short jobs ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: MONDAY,
      tripTime: "11:00",
      durationMinutes: 25,
      airportCode: "BFS",
      isFromAirport: false,
    },
    occupied: [bfsToCity],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, true);
  console.log("OK  C");
}

console.log("\n=== D. Impossible overlapping short journey ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: MONDAY,
      tripTime: "10:10",
      durationMinutes: 25,
    },
    occupied: [bfsToCity],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  assert.ok(
    decision.reason === SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING ||
      decision.reason === SMART_OPS_REASON.CONFLICT_POSITIONING_TIME,
  );
  console.log("OK  D");
}

const belfastToDub: SmartOccupiedJob = {
  id: "JOB-DUB",
  pickupLabel: "Belfast City Centre",
  dropoffLabel: "Dublin Airport",
  pickup: BELFAST,
  dropoff: DUB,
  tripDate: MONDAY,
  tripTime: "10:00",
  durationMinutes: 120,
  airportCode: "DUB",
  isFromAirport: false,
};

console.log("\n=== E. Belfast → Dublin blocks later Belfast job ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "11:30",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [belfastToDub],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  assert.equal(decision.reason, SMART_OPS_REASON.CONFLICT_LONG_DISTANCE);
  console.log("OK  E");
}

console.log("\n=== F. Earlier journey rejected if it blocks a later booking ===");
{
  const later: SmartOccupiedJob = {
    id: "JOB-LATER",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    tripTime: "13:30",
    durationMinutes: 25,
    airportCode: "BFS",
    isFromAirport: true,
  };
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Dublin Airport",
      pickup: BELFAST,
      dropoff: DUB,
      tripDate: MONDAY,
      tripTime: "10:00",
      durationMinutes: 120,
      airportCode: "DUB",
    },
    occupied: [later],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  console.log("OK  F");
}

console.log("\n=== G. Alternative nearby times ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: MONDAY,
      tripTime: "14:00",
    },
    occupied: [],
    rules: [mondayRule],
    config,
  });
  assert.equal(decision.available, false);
  assert.ok(decision.alternatives.length >= 1);
  assert.ok(decision.alternatives.some((item) => item.tripTime === "15:00" || item.tripTime === "12:00"));
  console.log("OK  G");
}

const dubParent: SmartReturnParent = {
  ...belfastToDub,
  amountGbp: 250,
};

console.log("\n=== H. Dublin return toward Belfast is eligible ===");
{
  const decision = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: DUB,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "12:30",
      airportCode: "DUB",
      isFromAirport: true,
      vehicle: "Saloon",
      normalJourneyFareGbp: 230,
    },
    parents: [dubParent],
    config,
    now: NOW,
    forceEnabled: true,
  });
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, SMART_OPS_REASON.SMART_RETURN_ELIGIBLE);
  assert.ok((decision.smartJourneyFareGbp || 0) < 230);
  assert.ok((decision.smartJourneyFareGbp || 0) >= config.smartReturn.minAcceptableFareGbp);
  console.log("OK  H");
}

console.log("\n=== I. Dublin → Galway does not qualify ===");
{
  const decision = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Galway",
      pickup: DUB,
      dropoff: GALWAY,
      tripDate: MONDAY,
      tripTime: "12:30",
      airportCode: "DUB",
      isFromAirport: true,
      vehicle: "Saloon",
      normalJourneyFareGbp: 180,
    },
    parents: [dubParent],
    config,
    now: NOW,
    forceEnabled: true,
  });
  assert.equal(decision.eligible, false);
  assert.ok(
    decision.reason === SMART_OPS_REASON.SMART_RETURN_POOR_ALIGNMENT ||
      decision.reason === SMART_OPS_REASON.SMART_RETURN_ROUTE_DEVIATION_TOO_HIGH,
  );
  console.log("OK  I");
}

console.log("\n=== J. BFS → Belfast can qualify with a smaller saving ===");
{
  const bfsParent: SmartReturnParent = {
    id: "JOB-BFS-OUT",
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    pickup: BELFAST,
    dropoff: BFS,
    tripDate: MONDAY,
    tripTime: "09:00",
    durationMinutes: 25,
    airportCode: "BFS",
    amountGbp: 45,
  };
  const dub = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: DUB,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "12:30",
      normalJourneyFareGbp: 230,
      vehicle: "Saloon",
    },
    parents: [dubParent],
    config,
    now: NOW,
    forceEnabled: true,
  });
  const bfs = evaluateSmartReturn({
    request: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "09:55",
      airportCode: "BFS",
      isFromAirport: true,
      normalJourneyFareGbp: 40,
      vehicle: "Saloon",
    },
    parents: [bfsParent],
    config,
    now: NOW,
    forceEnabled: true,
  });
  assert.equal(dub.eligible, true);
  assert.ok(bfs.eligible || bfs.reason === SMART_OPS_REASON.SMART_RETURN_BELOW_MINIMUM);
  if (bfs.eligible && dub.eligible) {
    assert.ok((bfs.savingGbp || 0) <= (dub.savingGbp || 0));
  }
  console.log("OK  J");
}

console.log("\n=== K. Smart Return never below minimum ===");
{
  const highFloor = normalizeSmartOpsConfig({
    ...config,
    smartReturn: { ...config.smartReturn, minAcceptableFareGbp: 200 },
  });
  const decision = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: DUB,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "12:30",
      normalJourneyFareGbp: 230,
      vehicle: "Saloon",
    },
    parents: [dubParent],
    config: highFloor,
    now: NOW,
    forceEnabled: true,
  });
  if (decision.smartJourneyFareGbp != null) {
    assert.ok(decision.smartJourneyFareGbp >= 200);
  }
  assert.ok(
    decision.eligible === false || (decision.smartJourneyFareGbp || 0) >= 200,
  );
  console.log("OK  K");
}

console.log("\n=== L. Estate remains £6 above Saloon ===");
{
  const saloon = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: DUB,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "12:30",
      normalJourneyFareGbp: 230,
      vehicle: "Saloon",
    },
    parents: [dubParent],
    config,
    now: NOW,
    forceEnabled: true,
  });
  const estate = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: DUB,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "12:30",
      normalJourneyFareGbp: 230,
      vehicle: "Estate",
    },
    parents: [dubParent],
    config,
    now: NOW,
    forceEnabled: true,
  });
  assert.equal(UNIVERSAL_ESTATE_PREMIUM_GBP, 6);
  if (saloon.smartJourneyFareGbp != null && estate.smartJourneyFareGbp != null) {
    assert.equal(estate.smartJourneyFareGbp - saloon.smartJourneyFareGbp, 6);
  }
  assert.equal(estate.normalJourneyFareGbp - saloon.normalJourneyFareGbp, 6);
  console.log("OK  L");
}

console.log("\n=== M/N. Parent cancel reassessment does not change customer price ===");
{
  const keep = reassessSmartReturnAfterParentCancel({
    confirmedLinkedFareGbp: 210,
    standaloneMinGbp: 200,
  });
  assert.equal(keep.keep, true);
  assert.equal(keep.flagOwner, false);
  assert.equal(keep.customerPriceUnchanged, true);
  const flag = reassessSmartReturnAfterParentCancel({
    confirmedLinkedFareGbp: 150,
    standaloneMinGbp: 210,
  });
  assert.equal(flag.keep, false);
  assert.equal(flag.flagOwner, true);
  assert.equal(flag.reason, SMART_OPS_REASON.SMART_RETURN_PARENT_CANCELLED);
  assert.equal(flag.customerPriceUnchanged, true);
  console.log("OK  M/N");
}

console.log("\n=== O. Disabling Smart Return restores normal pricing ===");
{
  const off = normalizeSmartOpsConfig({
    ...config,
    flags: { ...config.flags, smartReturnPricing: false },
  });
  const decision = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: DUB,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "12:30",
      normalJourneyFareGbp: 230,
    },
    parents: [dubParent],
    config: off,
    now: NOW,
  });
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, SMART_OPS_REASON.SMART_RETURN_DISABLED);
  assert.equal(decision.finalSmartFareGbp, null);
  console.log("OK  O");
}

console.log("\n=== P. Disabling Smart Availability leaves current booking behaviour ===");
{
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartAvailability, false);
  assert.equal(customerFacingSmartOpsEnabled(DEFAULT_SMART_OPS_CONFIG), false);
  const quote = read("src/components/QuoteCard.tsx");
  assert.doesNotMatch(quote, /evaluateSmartAvailability/);
  assert.doesNotMatch(quote, /OwnerSmartAvailabilityPanel/);
  const payments = read("workers/addresses/src/index.ts");
  assert.doesNotMatch(payments, /shouldForceSmartAvailability/);
  console.log("OK  P");
}

console.log("\n=== Q. Shadow mode does not change live quote ===");
{
  const shadow = evaluateSmartOpsShadow({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "Dublin Airport",
      pickup: BELFAST,
      dropoff: DUB,
      tripDate: MONDAY,
      tripTime: "14:00",
    },
    occupied: [],
    rules: [mondayRule],
    config,
    liveQuoted: true,
    liveAmountGbp: 250,
    normalJourneyFareGbp: 250,
    now: NOW,
  });
  assert.equal(shadow.liveQuoted, true);
  assert.equal(shadow.liveAmountGbp, 250);
  assert.equal(shadow.customerFacingWouldChange, false);
  const quoteHandler = read("workers/addresses/src/quote-handlers.ts");
  assert.match(quoteHandler, /recordQuoteShadowSafely/);
  assert.match(quoteHandler, /return json\(quoteBody, 200, origin\)/);
  console.log("OK  Q");
}

console.log("\n=== Newry corridor + owner/dashboard wiring ===");
{
  const newry = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Newry",
      pickup: DUB,
      dropoff: NEWRY,
      tripDate: MONDAY,
      tripTime: "12:30",
      normalJourneyFareGbp: 90,
      vehicle: "Saloon",
    },
    parents: [dubParent],
    config,
    now: NOW,
    forceEnabled: true,
  });
  assert.ok(
    newry.eligible ||
      newry.reason === SMART_OPS_REASON.SMART_RETURN_BELOW_MINIMUM ||
      newry.reason === SMART_OPS_REASON.SMART_RETURN_ELIGIBLE,
  );

  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  assert.match(switcher, /"availability"/);
  const panel = read("src/components/OwnerSmartAvailabilityPanel.tsx");
  assert.match(panel, /Shadow test mode/);
  assert.match(panel, /Owner test tool/);
  assert.match(panel, /Quick controls/);
  assert.doesNotMatch(panel, /first-booking|£5 booking offer/);
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /ownerToolTab === "availability"/);
  assert.match(page, /OwnerSmartAvailabilityPanel/);
  console.log("OK  wiring");
}

console.log("\nAll Smart Availability / Smart Return checks passed.");
