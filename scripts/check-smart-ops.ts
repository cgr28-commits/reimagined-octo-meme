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
  buildQuickBlockRule,
  buildUnavailableTimeRule,
  clearActiveQuickBlocks,
  describeUnavailableRule,
  expandSmartAvailabilityIntervals,
  findBlockingSmartInterval,
  findOverlappingSmartInterval,
  normalizeSmartAvailabilityException,
  normalizeSmartAvailabilityRule,
  unavailableFormFromRule,
} from "../shared/smart-availability";
import {
  coordsFromAirportHint,
  coordsFromPlaceLabel,
  customerAvailabilityMessage,
  evaluateSmartAvailability,
  findLatestSafePickup,
  labelsLikelySamePlace,
  normalizeSmartTripDate,
  normalizeSmartTripTime,
  occupiedJobsFromPaidBooking,
  positioningOverrunsDeadline,
  positioningTimeNeededMinutes,
  repositionMinutes,
  resolveSmartOpsPoint,
  type SmartOccupiedJob,
} from "../shared/smart-conflict";
import {
  evaluateSmartReturn,
  reassessSmartReturnAfterParentCancel,
  type SmartReturnParent,
} from "../shared/smart-return";
import { evaluateSmartOpsShadow } from "../shared/smart-shadow";
import { UNIVERSAL_ESTATE_PREMIUM_GBP } from "../shared/universal-distance-pricing";
import { addDaysYmd } from "../shared/upcoming-jobs";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const BFS = { lat: 54.6575, lng: -6.2158 };
const BELFAST = { lat: 54.5964, lng: -5.9302 };
const BHD = { lat: 54.6181, lng: -5.8724 };
const LARNE = { lat: 54.851, lng: -5.811 };
const DUB = { lat: 53.4264, lng: -6.2499 };
const NEWRY = { lat: 54.175, lng: -6.337 };
const GALWAY = { lat: 53.2707, lng: -9.0568 };

const NOW = new Date("2026-09-06T12:00:00+01:00");
const SATURDAY = "2026-09-06";
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
  assert.ok(decision.alternatives.every((item) => Math.abs(item.deltaMinutes) <= 60));
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
  assert.equal(flag.reason, SMART_OPS_REASON.SMART_RETURN_PARENT_CANCELLED_REVIEW_REQUIRED);
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
  assert.match(payments, /blockedCustomerSmartAvailabilityResponse/);
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
  assert.match(panel, /Add unavailable time/);
  assert.match(panel, /Unavailable from/);
  assert.match(panel, /Unavailable until/);
  assert.match(panel, /This date only/);
  assert.match(panel, /Every week/);
  assert.match(panel, /Days of the week/);
  assert.match(panel, /Save/);
  assert.match(panel, /Your unavailable times/);
  assert.match(panel, /startEdit/);
  assert.match(panel, /delete_rule/);
  assert.doesNotMatch(panel, /datetime-local/);
  assert.doesNotMatch(panel, /first-booking|£5 booking offer/);
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /ownerToolTab === "availability"/);
  assert.match(page, /OwnerSmartAvailabilityPanel/);
  console.log("OK  wiring");
}

const oneOffAfternoon = normalizeSmartAvailabilityRule({
  id: "block-1300-1500",
  kind: "one_off",
  startLocal: `${MONDAY}T13:00`,
  endLocal: `${MONDAY}T15:00`,
  enabled: true,
});
assert.ok(oneOffAfternoon);

const overnightRule = normalizeSmartAvailabilityRule({
  id: "block-overnight",
  kind: "one_off",
  startLocal: `${MONDAY}T22:00`,
  endLocal: `${addDaysYmd(MONDAY, 1)}T08:00`,
  enabled: true,
});
assert.ok(overnightRule);

console.log("\n=== Scenario A. Pickup inside 13:00–15:00 block ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "13:30",
      durationMinutes: 20,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  assert.equal(decision.reason, SMART_OPS_REASON.BLOCKED_OWNER_AVAILABILITY);
  console.log("OK  Scenario A");
}

console.log("\n=== Scenario B. 12:30 + 60-minute journey overlaps 13:00–15:00 ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "12:30",
      durationMinutes: 60,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  assert.equal(decision.reason, SMART_OPS_REASON.BLOCKED_JOURNEY_OVERLAPS_AVAILABILITY);
  console.log("OK  Scenario B");
}

console.log("\n=== Scenario C. 12:00 + 20-minute local journey before the block ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "12:00",
      durationMinutes: 20,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, true);
  console.log("OK  Scenario C");
}

console.log("\n=== Scenario D / 14. Overnight 01:00 has no 08:00 alternative ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: addDaysYmd(MONDAY, 1),
      tripTime: "01:00",
      durationMinutes: 20,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [overnightRule],
    config,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(decision.available, false);
  assert.equal(decision.alternatives.length, 0);
  assert.ok(!decision.alternatives.some((item) => item.tripTime === "08:00" || item.tripTime === "08:30"));
  assert.equal(decision.alternativeReason, SMART_OPS_REASON.NO_ALTERNATIVE_WITHIN_MAX_SHIFT);
  assert.match(
    customerAvailabilityMessage(decision, "01:00"),
    /don't have availability around your requested pickup time/,
  );
  assert.doesNotMatch(customerAvailabilityMessage(decision, "01:00"), /sleep|Cara|8am|appointment/i);
  console.log("OK  Scenario D");
}

console.log("\n=== Scenario E. 21:45 + 60-minute journey overlaps 22:00 overnight block ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "Dublin Airport",
      tripDate: MONDAY,
      tripTime: "21:45",
      durationMinutes: 60,
      pickup: BELFAST,
      dropoff: DUB,
    },
    occupied: [],
    rules: [overnightRule],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  assert.equal(decision.reason, SMART_OPS_REASON.BLOCKED_JOURNEY_OVERLAPS_AVAILABILITY);
  console.log("OK  Scenario E");
}

console.log("\n=== Scenario F. Compatible BFS → city then city → BFS ===");
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
    },
    occupied: [bfsToCity],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, true);
  console.log("OK  Scenario F");
}

console.log("\n=== Scenario G. Dublin outward blocks later BFS job ===");
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
  console.log("OK  Scenario G");
}

console.log("\n=== Scenario H. Later 15:00 BFS booking rejects 12:00 Dublin outward ===");
{
  const later: SmartOccupiedJob = {
    id: "JOB-1500-BFS",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    tripTime: "15:00",
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
      tripTime: "12:00",
      durationMinutes: 120,
      airportCode: "DUB",
    },
    occupied: [later],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  assert.ok(
    decision.reason === SMART_OPS_REASON.CONFLICT_NEXT_BOOKING ||
      decision.reason === SMART_OPS_REASON.CONFLICT_LONG_DISTANCE ||
      decision.reason === SMART_OPS_REASON.CONFLICT_POSITIONING_TIME,
  );
  console.log("OK  Scenario H");
}

console.log("\n=== Scenario I. Dublin → Belfast Smart Return eligible ===");
{
  const decision = evaluateSmartReturn({
    request: {
      pickupLabel: "Dublin Airport",
      dropoffLabel: "12 Malone Road, Belfast",
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
  console.log("OK  Scenario I");
}

console.log("\n=== Scenario J. Dublin → Galway not eligible ===");
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
  console.log("OK  Scenario J");
}

console.log("\n=== Scenario K. Short BFS airport return uses smaller discount ===");
{
  const bfsParent: SmartReturnParent = {
    id: "JOB-BFS-OUT-K",
    pickupLabel: "12 Malone Road, Belfast",
    dropoffLabel: "Belfast International Airport",
    pickup: BELFAST,
    dropoff: BFS,
    tripDate: MONDAY,
    tripTime: "09:00",
    durationMinutes: 25,
    airportCode: "BFS",
    amountGbp: 45,
  };
  const bfs = evaluateSmartReturn({
    request: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 Malone Road, Belfast",
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
  assert.ok(bfs.eligible || bfs.reason === SMART_OPS_REASON.SMART_RETURN_BELOW_MINIMUM);
  if (bfs.eligible && dub.eligible) {
    assert.ok((bfs.savingGbp || 0) <= (dub.savingGbp || 0));
  }
  console.log("OK  Scenario K");
}

console.log("\n=== Scenario L. Parent cancel never changes confirmed price ===");
{
  const keep = reassessSmartReturnAfterParentCancel({
    confirmedLinkedFareGbp: 210,
    standaloneMinGbp: 200,
  });
  assert.equal(keep.keep, true);
  assert.equal(keep.customerPriceUnchanged, true);
  const review = reassessSmartReturnAfterParentCancel({
    confirmedLinkedFareGbp: 150,
    standaloneMinGbp: 210,
  });
  assert.equal(review.flagOwner, true);
  assert.equal(review.reason, SMART_OPS_REASON.SMART_RETURN_PARENT_CANCELLED_REVIEW_REQUIRED);
  console.log("OK  Scenario L");
}

console.log("\n=== Scenario M. Booking created >90 days earlier still conflicts ===");
{
  const farFuture = occupiedJobsFromPaidBooking({
    paymentReference: "OLD-CREATED-FUTURE-TRIP",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast",
    tripDate: "2026-12-20",
    tripTime: "10:00",
    journeyDuration: "25 min",
    pickupLat: BFS.lat,
    pickupLng: BFS.lng,
    dropoffLat: BELFAST.lat,
    dropoffLng: BELFAST.lng,
    airportCode: "BFS",
    isFromAirport: true,
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    status: "confirmed",
  });
  assert.equal(farFuture.length, 1);
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: "2026-12-20",
      tripTime: "10:10",
      durationMinutes: 25,
    },
    occupied: farFuture,
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, false);
  const handlers = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(handlers, /listPaidBookingsForTripRange/);
  assert.match(handlers, /listUpcomingPaidBookings/);
  assert.doesNotMatch(handlers, /listPaidBookingsCreatedSince/);
  console.log("OK  Scenario M");
}

console.log("\n=== Scenario N. Return booking occupies both legs ===");
{
  const jobs = occupiedJobsFromPaidBooking({
    paymentReference: "RET-2LEG",
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Dublin Airport",
    tripDate: "2026-09-10",
    tripTime: "10:00",
    returnJourney: true,
    returnDate: "2026-09-15",
    returnTime: "18:00",
    journeyDuration: "2h 0m",
    pickupLat: BELFAST.lat,
    pickupLng: BELFAST.lng,
    dropoffLat: DUB.lat,
    dropoffLng: DUB.lng,
    airportCode: "DUB",
    operationalStatus: "confirmed",
    paymentStatus: "partially_refunded",
    status: "confirmed",
  });
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]?.tripDate, "2026-09-10");
  assert.equal(jobs[1]?.tripDate, "2026-09-15");
  const outboundHit = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: "2026-09-10",
      tripTime: "10:30",
      durationMinutes: 20,
    },
    occupied: jobs,
    config,
    searchAlternatives: false,
  });
  const returnHit = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: "2026-09-15",
      tripTime: "18:15",
      durationMinutes: 20,
    },
    occupied: jobs,
    config,
    searchAlternatives: false,
  });
  assert.equal(outboundHit.available, false);
  assert.equal(returnHit.available, false);
  console.log("OK  Scenario N");
}

console.log("\n=== Scenario O. Available again now keeps Friday’s planned block ===");
{
  const friday = normalizeSmartAvailabilityRule({
    id: "friday-planned",
    kind: "one_off",
    startLocal: "2026-09-11T13:00",
    endLocal: "2026-09-11T17:00",
    note: "School run",
    enabled: true,
  });
  assert.ok(friday);
  const quick = buildQuickBlockRule("hours", 2, new Date("2026-09-05T18:00:00+01:00"));
  assert.ok(quick);
  const cleared = clearActiveQuickBlocks(
    [friday, quick],
    new Date("2026-09-05T18:30:00+01:00"),
  );
  const planned = cleared.find((rule) => rule.id === "friday-planned");
  const quickAfter = cleared.find((rule) => rule.id === quick.id);
  assert.equal(planned?.enabled, true);
  assert.equal(quickAfter?.enabled, false);
  const handlers = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(handlers, /clearActiveQuickBlocks/);
  console.log("OK  Scenario O");
}

console.log("\n=== 12:30 + 15-minute journey may remain available ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "12:30",
      durationMinutes: 15,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, true);
  console.log("OK  12:30/15-min before block");
}

console.log("\n=== 15:00 booking after a 13:00–15:00 block is allowed ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "15:00",
      durationMinutes: 20,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(decision.available, true);
  console.log("OK  no post-block buffer");
}

console.log("\n=== Airport pre-buffer must not extend a personal block backwards ===");
{
  const airportAt1500 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "15:00",
      durationMinutes: 25,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(airportAt1500.available, true);
  assert.equal(airportAt1500.diagnostics.personalBlockWindowStartLocal, `${MONDAY}T15:00`);
  assert.ok(airportAt1500.diagnostics.operationalStartLocal?.endsWith("T14:30"));

  const airportAt1445 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "14:45",
      durationMinutes: 25,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(airportAt1445.available, false);
  assert.equal(airportAt1445.reason, SMART_OPS_REASON.BLOCKED_OWNER_AVAILABILITY);

  const nonAirportAt1500 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: MONDAY,
      tripTime: "15:00",
      durationMinutes: 25,
      airportCode: "BFS",
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    searchAlternatives: false,
  });
  assert.equal(nonAirportAt1500.available, true);

  const existingAirport: SmartOccupiedJob = {
    id: "JOB-1500-AIRPORT-BUFFER",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    tripTime: "15:00",
    durationMinutes: 25,
    airportCode: "BFS",
    isFromAirport: true,
  };
  const preceding = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: MONDAY,
      tripTime: "14:00",
      durationMinutes: 25,
      airportCode: "BFS",
    },
    occupied: [existingAirport],
    config,
    searchAlternatives: false,
  });
  assert.equal(preceding.available, false);
  assert.ok(
    preceding.reason === SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING ||
      preceding.reason === SMART_OPS_REASON.CONFLICT_NEXT_BOOKING ||
      preceding.reason === SMART_OPS_REASON.CONFLICT_POSITIONING_TIME ||
      preceding.reason === SMART_OPS_REASON.CONFLICT_LONG_DISTANCE,
  );
  console.log("OK  airport pre-buffer vs personal block");
}

console.log("\n=== Overnight recurring 22:00–08:00 spans midnight ===");
{
  const recurringNight = normalizeSmartAvailabilityRule({
    id: "recurring-night",
    kind: "recurring",
    weekdays: [1],
    startTime: "22:00",
    endTime: "08:00",
    enabled: true,
  });
  assert.ok(recurringNight);
  const intervals = expandSmartAvailabilityIntervals({
    rules: [recurringNight],
    fromYmd: MONDAY,
    toYmd: addDaysYmd(MONDAY, 1),
  });
  assert.ok(findBlockingSmartInterval(MONDAY, "23:30", intervals));
  assert.ok(findBlockingSmartInterval(addDaysYmd(MONDAY, 1), "01:00", intervals));
  assert.ok(findBlockingSmartInterval(addDaysYmd(MONDAY, 1), "05:00", intervals));
  assert.ok(findBlockingSmartInterval(addDaysYmd(MONDAY, 1), "07:30", intervals));
  const pickup = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: addDaysYmd(MONDAY, 1),
      tripTime: "01:00",
      durationMinutes: 15,
    },
    occupied: [],
    rules: [recurringNight],
    config,
    searchAlternatives: false,
  });
  assert.equal(pickup.available, false);
  assert.equal(pickup.reason, SMART_OPS_REASON.BLOCKED_RECURRING_AVAILABILITY);
  console.log("OK  overnight recurring");
}

console.log("\n=== Cancelled operational booking does not block; partial refund still does ===");
{
  const cancelled = occupiedJobsFromPaidBooking({
    paymentReference: "CANCELLED-OP",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    tripDate: MONDAY,
    tripTime: "10:00",
    journeyDuration: "25 min",
    operationalStatus: "cancelled",
    paymentStatus: "fully_refunded",
    status: "refunded",
  });
  assert.equal(cancelled.length, 0);
  const partial = occupiedJobsFromPaidBooking({
    paymentReference: "PARTIAL-REFUND",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast",
    tripDate: MONDAY,
    tripTime: "10:00",
    journeyDuration: "25 min",
    pickupLat: BFS.lat,
    pickupLng: BFS.lng,
    dropoffLat: BELFAST.lat,
    dropoffLng: BELFAST.lng,
    airportCode: "BFS",
    isFromAirport: true,
    operationalStatus: "confirmed",
    paymentStatus: "partially_refunded",
    status: "confirmed",
  });
  assert.equal(partial.length, 1);
  console.log("OK  operational vs payment status");
}

console.log("\n=== Nearby alternatives use professional copy ===");
{
  const decision = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: MONDAY,
      tripTime: "14:00",
      durationMinutes: 20,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [oneOffAfternoon],
    config,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(decision.available, false);
  const message = customerAvailabilityMessage(decision, "14:00");
  assert.match(message, /isn't available/);
  assert.match(message, /Nearby times available/);
  assert.doesNotMatch(message, /Cara|sleep|appointment/i);
  console.log("OK  alternative copy");
}

console.log("\n=== Same-place zero-gap jobs need minimum turnaround ===");
{
  const first: SmartOccupiedJob = {
    id: "JOB-TURN",
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast City Centre",
    pickup: BELFAST,
    dropoff: BELFAST,
    tripDate: MONDAY,
    tripTime: "10:00",
    durationMinutes: 20,
  };
  const tooClose = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: MONDAY,
      tripTime: "10:29",
      durationMinutes: 20,
    },
    occupied: [first],
    config,
    searchAlternatives: false,
  });
  assert.equal(tooClose.available, false);
  const readyAt1030 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      pickup: BELFAST,
      dropoff: BFS,
      tripDate: MONDAY,
      tripTime: "10:35",
      durationMinutes: 20,
    },
    occupied: [first],
    config,
    searchAlternatives: false,
  });
  assert.equal(readyAt1030.available, true);
  assert.equal(
    positioningOverrunsDeadline(
      Date.parse(`${MONDAY}T10:20:00+01:00`),
      10,
      Date.parse(`${MONDAY}T10:29:00+01:00`),
    ),
    true,
  );
  assert.equal(
    positioningOverrunsDeadline(
      Date.parse(`${MONDAY}T10:20:00+01:00`),
      10,
      Date.parse(`${MONDAY}T10:30:00+01:00`),
    ),
    false,
  );
  console.log("OK  minimum turnaround");
}

console.log("\n=== Defaults remain customer-off / shadow-on ===");
{
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartAvailability, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.alternativeTimeSuggestions, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartReturnPricing, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.returnCorridorMatching, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.backupDriverCapacity, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.shadowMode, true);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.buffers.minTurnaroundMinutes, 10);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.alternatives.maxShiftMinutes, 60);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.alternatives.allowAcrossMidnight, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.smartReturn.releaseMode, "inside_free_cancel_cutoff");
  const refund = read("workers/addresses/src/refund-handlers.ts");
  assert.match(refund, /reassessSmartReturnsForCancelledParent/);
  assert.match(refund, /pickupLat/);
  assert.match(read("shared/route-metrics-resolver.ts"), /pickup: origin\.point/);
  void findOverlappingSmartInterval;
  console.log("OK  defaults + wiring");
}

console.log("\n=== Add unavailable time: tomorrow 00:00–10:00 one-off ===");
{
  const tomorrow = addDaysYmd(MONDAY, 1);
  const rule = buildUnavailableTimeRule({
    id: "sleep-in",
    repeat: "one_off",
    date: tomorrow,
    startTime: "00:00",
    endTime: "10:00",
  });
  assert.ok(rule);
  assert.equal(rule.kind, "one_off");
  assert.equal(rule.startLocal, `${tomorrow}T00:00`);
  assert.equal(rule.endLocal, `${tomorrow}T10:00`);
  assert.match(describeUnavailableRule(rule, MONDAY), /Tomorrow 00:00–10:00/);

  const early = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: tomorrow,
      tripTime: "09:30",
      durationMinutes: 25,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [rule],
    config,
    searchAlternatives: false,
  });
  assert.equal(early.available, false);
  assert.equal(early.reason, SMART_OPS_REASON.BLOCKED_OWNER_AVAILABILITY);

  const fromTen = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: tomorrow,
      tripTime: "10:00",
      durationMinutes: 25,
      pickup: BELFAST,
      dropoff: BFS,
    },
    occupied: [],
    rules: [rule],
    config,
    searchAlternatives: false,
  });
  assert.equal(fromTen.available, true);

  const form = unavailableFormFromRule(rule, MONDAY);
  assert.equal(form.repeat, "one_off");
  assert.equal(form.date, tomorrow);
  assert.equal(form.startTime, "00:00");
  assert.equal(form.endTime, "10:00");

  const weekly = buildUnavailableTimeRule({
    id: "mon-sleep",
    repeat: "recurring",
    startTime: "00:00",
    endTime: "10:00",
    weekdays: [1],
  });
  assert.ok(weekly);
  assert.equal(weekly.kind, "recurring");
  assert.match(describeUnavailableRule(weekly, MONDAY), /Every Monday 00:00–10:00/);

  const handlers = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(handlers, /returnCorridorMatching: false/);
  assert.match(handlers, /backupDriverCapacity: false/);
  assert.match(handlers, /ruleId: interval.ruleId/);
  console.log("OK  add unavailable time 00:00–10:00");
}

console.log("\n=== Geographical positioning: City Centre → Larne after 05:45 ===");
{
  assert.equal(labelsLikelySamePlace("Belfast", "George Best Belfast City Airport"), false);
  assert.equal(labelsLikelySamePlace("Belfast City Centre", "12 Wyncairn Gardens, Larne"), false);
  const cityCentre = coordsFromPlaceLabel("Belfast City Centre");
  const larnePlace = coordsFromPlaceLabel("12 Wyncairn Gardens, Larne");
  assert.ok(cityCentre);
  assert.ok(larnePlace);
  assert.ok(Math.abs(cityCentre.lat - BELFAST.lat) < 0.02);
  assert.ok(cityCentre.lat !== 54.6181);

  const cityToLarne = repositionMinutes(BELFAST, LARNE, {
    fromLabel: "Belfast City Centre",
    toLabel: "12 Wyncairn Gardens, Larne",
  });
  assert.ok(cityToLarne > 30, `City→Larne should be a real drive, got ${cityToLarne}`);
  assert.notEqual(cityToLarne, 0);

  const larneAt0700: SmartOccupiedJob = {
    id: "JOB-LARNE-0700",
    pickupLabel: "12 Wyncairn Gardens, Larne",
    dropoffLabel: "George Best Belfast City Airport",
    pickup: LARNE,
    dropoff: BHD,
    tripDate: MONDAY,
    tripTime: "07:00",
    durationMinutes: 35,
    airportCode: "BHD",
  };

  const proposed0545 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "05:45",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [larneAt0700],
    config,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(proposed0545.available, false);
  assert.ok(
    proposed0545.diagnostics.nextPositioningMinutes === cityToLarne,
    `next positioning should be City→Larne ${cityToLarne}, got ${proposed0545.diagnostics.nextPositioningMinutes}`,
  );
  assert.equal(proposed0545.diagnostics.positioningMinutes, cityToLarne);
  assert.equal(proposed0545.diagnostics.positioningFromLabel, "Belfast City Centre");
  assert.equal(proposed0545.diagnostics.positioningToLabel, "12 Wyncairn Gardens, Larne");
  assert.equal(proposed0545.diagnostics.positioningCoordsKnown, true);
  assert.ok(proposed0545.diagnostics.positioningMinutes !== 0);

  const earlier = proposed0545.alternatives.map((item) => item.tripTime);
  const alt0530 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "05:30",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  // 05:30 finishes 06:00. 06:00 + 58 needed = 06:58, which is before 07:00.
  const needed0530 = positioningTimeNeededMinutes(cityToLarne, 10);
  assert.equal(alt0530.available, needed0530 <= 60);
  if (needed0530 > 60) {
    assert.ok(!earlier.includes("05:30"));
  }

  const alt0515 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: MONDAY,
      tripTime: "05:15",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(alt0515.available, cityToLarne <= 60);

  const fromLabelsOnly = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: MONDAY,
      tripTime: "05:45",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [
      {
        ...larneAt0700,
        pickup: undefined,
        dropoff: undefined,
      },
    ],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.ok((fromLabelsOnly.diagnostics.nextPositioningMinutes || 0) > 0);
  assert.equal(fromLabelsOnly.diagnostics.positioningCoordsKnown, true);
  console.log(`OK  next-booking City→Larne positioning ${cityToLarne} min`);
}

console.log("\n=== Geographical positioning: previous booking destination → proposed pickup ===");
{
  const existing0545: SmartOccupiedJob = {
    id: "JOB-BFS-CITY-0545",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    tripTime: "05:45",
    durationMinutes: 30,
    airportCode: "BFS",
    isFromAirport: true,
  };
  const cityToLarne = repositionMinutes(BELFAST, LARNE, {
    fromLabel: "Belfast City Centre",
    toLabel: "12 Wyncairn Gardens, Larne",
  });
  const proposed0700 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "12 Wyncairn Gardens, Larne",
      dropoffLabel: "George Best Belfast City Airport",
      pickup: LARNE,
      dropoff: BHD,
      tripDate: MONDAY,
      tripTime: "07:00",
      durationMinutes: 35,
      airportCode: "BHD",
    },
    occupied: [existing0545],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(proposed0700.diagnostics.previousBookingId, "JOB-BFS-CITY-0545");
  assert.equal(proposed0700.diagnostics.previousPositioningMinutes, cityToLarne);
  assert.equal(proposed0700.diagnostics.positioningMinutes, cityToLarne);
  assert.equal(proposed0700.diagnostics.positioningFromLabel, "Belfast City Centre");
  assert.equal(proposed0700.diagnostics.positioningToLabel, "12 Wyncairn Gardens, Larne");
  assert.equal(proposed0700.available, false);
  console.log("OK  previous-booking City→Larne positioning");
}

console.log("\n=== Live 05:45 case: airport code must not move Larne onto BHD ===");
{
  const cityToBhd = repositionMinutes(BELFAST, BHD, {
    fromLabel: "Belfast City Centre",
    toLabel: "George Best Belfast City Airport",
  });
  const cityToLarne = repositionMinutes(BELFAST, LARNE, {
    fromLabel: "Belfast City Centre",
    toLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
  });
  assert.ok(cityToBhd > 0 && cityToBhd < 25, `City→BHD should be the short ~14 min hop, got ${cityToBhd}`);
  assert.ok(cityToLarne >= 40, `City→Larne must stay a real drive, got ${cityToLarne}`);
  assert.notEqual(cityToLarne, cityToBhd);

  assert.equal(coordsFromAirportHint("12 Wyncairn Gardens, Larne BT40 2EB", "BHD"), null);
  const recovered = resolveSmartOpsPoint(BHD, "12 Wyncairn Gardens, Larne BT40 2EB", "BHD");
  assert.ok(recovered);
  assert.ok(Math.abs(recovered.lat - LARNE.lat) < 0.02);

  const fromPaid = occupiedJobsFromPaidBooking({
    id: "JOB-LARNE-0700-LIVE",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    tripDate: MONDAY,
    tripTime: "07:00",
    airportCode: "BHD",
    pickupLat: BHD.lat,
    pickupLng: BHD.lng,
    dropoffLat: BHD.lat,
    dropoffLng: BHD.lng,
    routeDurationMinutes: 14,
  });
  assert.equal(fromPaid.length, 1);
  assert.ok(fromPaid[0].pickup);
  assert.ok(Math.abs((fromPaid[0].pickup?.lat || 0) - LARNE.lat) < 0.02);
  assert.ok(fromPaid[0].dropoff);
  assert.ok(Math.abs((fromPaid[0].dropoff?.lat || 0) - BHD.lat) < 0.02);

  const proposed0545 = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: MONDAY,
      tripTime: "05:45",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: fromPaid,
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(positioningTimeNeededMinutes(30, 10), 40);
  assert.equal(positioningTimeNeededMinutes(0, 10), 10);
  assert.equal(positioningTimeNeededMinutes(cityToLarne, 10), cityToLarne + 10);
  // Finish 06:15 + 58 needed = 07:13, after the 07:00 Larne pickup.
  assert.ok(cityToLarne >= 40);
  assert.ok(cityToLarne + 10 > 30);
  assert.equal(proposed0545.available, false);
  assert.equal(proposed0545.reason, SMART_OPS_REASON.CONFLICT_NEXT_BOOKING);
  assert.equal(proposed0545.diagnostics.positioningMinutes, cityToLarne);
  assert.equal(proposed0545.diagnostics.positioningNeededMinutes, cityToLarne + 10);
  assert.equal(proposed0545.diagnostics.estimatedCompletionLocal, `${MONDAY}T06:15`);
  assert.equal(proposed0545.diagnostics.earliestReadyLocal, `${MONDAY}T07:13`);
  assert.equal(proposed0545.diagnostics.nextPickupLocal, `${MONDAY}T07:00`);
  assert.equal(proposed0545.diagnostics.positioningGapMinutes, 45);
  assert.equal(positioningOverrunsDeadline(Date.parse("2026-09-07T06:15:00+01:00"), cityToLarne + 10, Date.parse("2026-09-07T07:00:00+01:00")), true);
  assert.notEqual(proposed0545.diagnostics.positioningMinutes, cityToBhd);
  assert.ok((proposed0545.diagnostics.positioningToCoords?.lat || 0) > 54.8);
  const withAlts = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: MONDAY,
      tripTime: "05:45",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: fromPaid,
    config,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(withAlts.available, false);
  assert.ok((withAlts.alternatives || []).some((item) => item.tripTime === "05:30"));

  const reverse = evaluateSmartAvailability({
    requested: {
      pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
      dropoffLabel: "George Best Belfast City Airport",
      tripDate: MONDAY,
      tripTime: "07:00",
      durationMinutes: 35,
      airportCode: "BHD",
    },
    occupied: [
      {
        id: "JOB-BFS-CITY-0545-LIVE",
        pickupLabel: "Belfast International Airport",
        dropoffLabel: "Belfast City Centre",
        tripDate: MONDAY,
        tripTime: "05:45",
        durationMinutes: 30,
        airportCode: "BFS",
        isFromAirport: true,
      },
    ],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(reverse.available, false);
  assert.equal(reverse.diagnostics.positioningMinutes, cityToLarne);
  assert.equal(reverse.diagnostics.positioningFromLabel, "Belfast City Centre");
  assert.equal(reverse.diagnostics.positioningToLabel, "12 Wyncairn Gardens, Larne BT40 2EB");
  console.log(`OK  live 05:45 trap: City→BHD ${cityToBhd} min vs City→Larne ${cityToLarne} min; 05:45 unavailable`);
}

console.log("\n=== Decision must enforce 58-minute City→Larne need after 05:45 ===");
{
  const larneAt0700 = occupiedJobsFromPaidBooking({
    id: "JOB-LARNE-0700-DECISION",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    tripDate: MONDAY,
    tripTime: "07:00",
    airportCode: "BHD",
    pickupLat: BHD.lat,
    pickupLng: BHD.lng,
    dropoffLat: BHD.lat,
    dropoffLng: BHD.lng,
    routeDurationMinutes: 14,
  });
  const requested = {
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    tripDate: MONDAY,
    tripTime: "05:45",
    durationMinutes: 30,
    airportCode: "BFS",
    isFromAirport: true,
  };
  const proposed0545 = evaluateSmartAvailability({
    requested,
    occupied: larneAt0700,
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(proposed0545.diagnostics.nextPositioningMinutes, 48);
  assert.equal(proposed0545.diagnostics.positioningNeededMinutes, 58);
  assert.equal(proposed0545.diagnostics.estimatedCompletionLocal, `${MONDAY}T06:15`);
  assert.equal(proposed0545.diagnostics.earliestReadyLocal, `${MONDAY}T07:13`);
  assert.equal(proposed0545.diagnostics.nextPickupLocal, `${MONDAY}T07:00`);
  assert.equal(proposed0545.diagnostics.positioningGapMinutes, 45);
  assert.equal(proposed0545.available, false);
  assert.equal(proposed0545.reason, SMART_OPS_REASON.CONFLICT_NEXT_BOOKING);
  assert.ok(proposed0545.warnings.some((item) => item.reason === SMART_OPS_REASON.CONFLICT_NEXT_BOOKING));

  const latest = findLatestSafePickup({
    requested,
    occupied: larneAt0700,
    config,
    beforeTime: "07:00",
    now: new Date("2026-09-06T12:00:00+01:00"),
    stepMinutes: 1,
  });
  assert.ok(latest, "expected a safe pickup before 07:00");
  assert.equal(latest?.tripTime, "05:32");
  assert.equal(latest?.decision.available, true);
  assert.equal(latest?.decision.diagnostics.estimatedCompletionLocal, `${MONDAY}T06:02`);
  assert.equal(latest?.decision.diagnostics.earliestReadyLocal, `${MONDAY}T07:00`);
  assert.equal(latest?.decision.diagnostics.positioningNeededMinutes, 58);

  const justLate = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "05:33" },
    occupied: larneAt0700,
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(justLate.available, false);
  assert.equal(justLate.reason, SMART_OPS_REASON.CONFLICT_NEXT_BOOKING);
  assert.equal(justLate.diagnostics.earliestReadyLocal, `${MONDAY}T07:01`);
  console.log("OK  05:45 rejected; latest safe pickup before 07:00 Larne is 05:32");
}

console.log("\n=== Same-morning 6 Sep 05:45 vs 6 Sep 07:00 Larne uses full dates ===");
{
  assert.equal(normalizeSmartTripDate("06/09/2026"), SATURDAY);
  assert.equal(normalizeSmartTripDate("2026-09-06T00:00:00.000Z"), SATURDAY);
  assert.equal(normalizeSmartTripTime("7:00"), "07:00");
  assert.equal(normalizeSmartTripTime("07:00:00.000Z"), "07:00");

  const sameMorning = occupiedJobsFromPaidBooking({
    id: "JOB-LARNE-6SEP-0700",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    tripDate: "2026-09-06T00:00:00.000Z",
    tripTime: "07:00:00",
    airportCode: "BHD",
    pickupLat: BHD.lat,
    pickupLng: BHD.lng,
    dropoffLat: BHD.lat,
    dropoffLng: BHD.lng,
    routeDurationMinutes: 14,
  });
  assert.equal(sameMorning[0].tripDate, SATURDAY);
  assert.equal(sameMorning[0].tripTime, "07:00");

  const proposed = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: SATURDAY,
      tripTime: "05:45",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: sameMorning,
    config,
    searchAlternatives: false,
    now: new Date("2026-09-05T12:00:00+01:00"),
  });
  assert.equal(proposed.available, false);
  assert.equal(proposed.reason, SMART_OPS_REASON.CONFLICT_NEXT_BOOKING);
  assert.equal(proposed.diagnostics.estimatedCompletionLocal, `${SATURDAY}T06:15`);
  assert.equal(proposed.diagnostics.earliestReadyLocal, `${SATURDAY}T07:13`);
  assert.equal(proposed.diagnostics.nextBookingTripDate, SATURDAY);
  assert.equal(proposed.diagnostics.nextBookingTripTime, "07:00");
  assert.equal(proposed.diagnostics.nextBookingResolvedLocal, `${SATURDAY}T07:00`);
  assert.equal(proposed.diagnostics.sameCalendarDayAsNext, true);
  assert.equal(proposed.diagnostics.positioningGapMinutes, 45);
  assert.equal(proposed.diagnostics.comparisonFromLocal, `${SATURDAY}T06:15`);
  assert.equal(proposed.diagnostics.comparisonToLocal, `${SATURDAY}T07:00`);

  const nextMorningOnly = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: SATURDAY,
      tripTime: "05:45",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [
      {
        id: "JOB-LARNE-7SEP-0700",
        pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
        dropoffLabel: "George Best Belfast City Airport",
        pickup: LARNE,
        dropoff: BHD,
        tripDate: MONDAY,
        tripTime: "07:00",
        durationMinutes: 35,
        airportCode: "BHD",
      },
    ],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-05T12:00:00+01:00"),
  });
  assert.equal(nextMorningOnly.available, true);
  assert.equal(nextMorningOnly.diagnostics.sameCalendarDayAsNext, false);
  assert.equal(nextMorningOnly.diagnostics.nextBookingTripDate, MONDAY);
  assert.equal(nextMorningOnly.diagnostics.nextBookingResolvedLocal, `${MONDAY}T07:00`);
  assert.equal(nextMorningOnly.diagnostics.earliestReadyLocal, `${SATURDAY}T07:13`);
  assert.equal(nextMorningOnly.diagnostics.positioningGapMinutes, 1485);

  const messySameMorning = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: SATURDAY,
      tripTime: "05:45",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [
      {
        id: "JOB-LARNE-DMY",
        pickupLabel: "12 Wyncairn Gardens, Larne",
        dropoffLabel: "George Best Belfast City Airport",
        pickup: LARNE,
        dropoff: BHD,
        tripDate: "06/09/2026",
        tripTime: "7:00",
        durationMinutes: 35,
        airportCode: "BHD",
      },
    ],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-05T12:00:00+01:00"),
  });
  assert.equal(messySameMorning.available, false);
  assert.equal(messySameMorning.reason, SMART_OPS_REASON.CONFLICT_NEXT_BOOKING);
  assert.equal(messySameMorning.diagnostics.nextBookingTripDate, SATURDAY);
  assert.equal(messySameMorning.diagnostics.sameCalendarDayAsNext, true);
  console.log("OK  6 Sep 05:45 vs same-morning 07:00 is a conflict; next-day 07:00 is not");
}

console.log("\n=== 7 Sep 05:30 vs 07:00 Larne: 58 already includes the 10-minute turnaround ===");
{
  const larneAt0700: SmartOccupiedJob = {
    id: "JOB-LARNE-0700-BOUNDARY",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    pickup: LARNE,
    dropoff: BHD,
    tripDate: MONDAY,
    tripTime: "07:00",
    durationMinutes: 35,
    airportCode: "BHD",
  };
  const requested = {
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    durationMinutes: 30,
    airportCode: "BFS" as const,
    isFromAirport: true,
  };
  const travel = repositionMinutes(BELFAST, LARNE, {
    fromLabel: "Belfast City Centre",
    toLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
  });
  assert.equal(travel, 48);
  assert.equal(positioningTimeNeededMinutes(travel, 10), 58);
  assert.notEqual(positioningTimeNeededMinutes(travel, 10), 68);

  const at0530 = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "05:30" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(at0530.diagnostics.positioningTravelMinutes, 48);
  assert.equal(at0530.diagnostics.minTurnaroundMinutes, 10);
  assert.equal(at0530.diagnostics.positioningNeededMinutes, 58);
  assert.equal(at0530.diagnostics.estimatedCompletionLocal, `${MONDAY}T06:00`);
  assert.equal(at0530.diagnostics.earliestReadyLocal, `${MONDAY}T06:58`);
  assert.equal(at0530.diagnostics.nextPickupLocal, `${MONDAY}T07:00`);
  // Arrive ~06:48 after the 48-minute drive; 10-minute turnaround uses 06:48–06:58;
  // 2 minutes remain before 07:00. That leftover is not a missing turnaround.
  assert.equal(at0530.available, true);

  const at0545 = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "05:45" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(at0545.available, false);
  assert.equal(at0545.diagnostics.positioningNeededMinutes, 58);
  assert.equal(at0545.diagnostics.earliestReadyLocal, `${MONDAY}T07:13`);
  console.log("OK  05:30 stays available at ready 06:58; 58 is 48+10 once");
}

console.log("\n=== After-Larne 07:40: previous-booking conflict math (do not loosen rules) ===");
{
  const THURSDAY = "2026-09-10";
  const larneAt0700: SmartOccupiedJob = {
    id: "TAAA4672EAN",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    pickup: LARNE,
    dropoff: BHD,
    tripDate: MONDAY,
    tripTime: "07:00",
    durationMinutes: 35,
    airportCode: "BHD",
  };
  const laterOn10Sep: SmartOccupiedJob = {
    id: "JOB-10SEP-NEXT",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: THURSDAY,
    tripTime: "09:00",
    durationMinutes: 30,
    airportCode: "BFS",
    isFromAirport: true,
  };
  const requested0740 = {
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    tripTime: "07:40",
    durationMinutes: 30,
    airportCode: "BFS" as const,
    isFromAirport: true,
  };
  const bhdToBfs = repositionMinutes(BHD, BFS, {
    fromLabel: "George Best Belfast City Airport",
    toLabel: "Belfast International Airport",
  });
  const neededAfterLarne = positioningTimeNeededMinutes(bhdToBfs, 10);
  assert.ok(bhdToBfs >= 30, `BHD→BFS should be a real airport hop, got ${bhdToBfs}`);
  assert.equal(neededAfterLarne, bhdToBfs + 10);

  const at0740 = evaluateSmartAvailability({
    requested: requested0740,
    occupied: [larneAt0700, laterOn10Sep],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });

  // Identification
  assert.equal(at0740.diagnostics.previousBookingId, "TAAA4672EAN");
  assert.equal(at0740.diagnostics.previousBookingTripDate, MONDAY);
  assert.equal(at0740.diagnostics.previousBookingTripTime, "07:00");
  assert.equal(at0740.diagnostics.previousBookingPickupLocal, `${MONDAY}T07:00`);
  assert.equal(at0740.diagnostics.previousBookingDurationMinutes, 35);
  assert.equal(at0740.diagnostics.previousBookingCompletionLocal, `${MONDAY}T07:35`);
  assert.equal(at0740.diagnostics.previousBookingDestination, "George Best Belfast City Airport");
  assert.equal(at0740.diagnostics.previousBookingOperationalEndLocal, `${MONDAY}T07:50`);

  // Geography after the Larne job: BHD → BFS + 10-minute turnaround
  assert.equal(at0740.diagnostics.previousPositioningMinutes, bhdToBfs);
  assert.equal(at0740.diagnostics.previousPositioningNeededMinutes, neededAfterLarne);
  assert.equal(at0740.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T08:24`);
  assert.equal(at0740.diagnostics.requestedPickupLocal, `${MONDAY}T07:40`);
  assert.equal(at0740.diagnostics.proposedOnSiteDeadlineLocal, `${MONDAY}T07:10`);
  assert.equal(at0740.diagnostics.operationalStartLocal, `${MONDAY}T07:10`);
  assert.equal(at0740.diagnostics.estimatedCompletionLocal, `${MONDAY}T08:10`);
  assert.equal(at0740.diagnostics.operationalEndLocal, `${MONDAY}T08:25`);

  // Decision: 07:40 is rejected. First reason is operational-window overlap
  // (airport pre-buffer pulls the proposed window back to 07:10, which sits
  // inside the Larne job’s 07:00–07:50 operational window). Positioning would
  // also fail (07:35 + 49 = 08:24 after the 07:10 on-site deadline), but the
  // engine reports overlap first. Do not change that order for this test.
  assert.equal(at0740.available, false);
  assert.equal(at0740.reason, SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING);
  assert.equal(at0740.diagnostics.conflictKind, "overlap");
  assert.equal(at0740.diagnostics.conflictBookingId, "TAAA4672EAN");
  assert.match(String(at0740.diagnostics.conflictSummary), /Overlaps operational window of booking TAAA4672EAN/);

  // Banner must talk about the previous hop, not the 10 September next booking.
  assert.equal(at0740.diagnostics.nextBookingId, "JOB-10SEP-NEXT");
  assert.equal(at0740.diagnostics.nextBookingTripDate, THURSDAY);
  assert.equal(at0740.diagnostics.sameCalendarDayAsNext, false);
  assert.equal(at0740.diagnostics.positioningFromLabel, "George Best Belfast City Airport");
  assert.equal(at0740.diagnostics.positioningToLabel, "Belfast International Airport");
  assert.equal(at0740.diagnostics.positioningMinutes, bhdToBfs);
  assert.equal(at0740.diagnostics.positioningNeededMinutes, neededAfterLarne);
  assert.equal(at0740.diagnostics.earliestReadyLocal, `${MONDAY}T08:24`);
  assert.equal(at0740.diagnostics.comparisonFromLocal, `${MONDAY}T07:35`);
  assert.equal(at0740.diagnostics.comparisonToLocal, `${MONDAY}T07:10`);

  console.log(
    [
      `OK  07:40 after Larne→BHD is CONFLICT_EXISTING_BOOKING / overlap`,
      `previous pickup ${at0740.diagnostics.previousBookingPickupLocal}`,
      `previous duration ${at0740.diagnostics.previousBookingDurationMinutes} min`,
      `previous completion ${at0740.diagnostics.previousBookingCompletionLocal} at ${at0740.diagnostics.previousBookingDestination}`,
      `previous operational end ${at0740.diagnostics.previousBookingOperationalEndLocal}`,
      `BHD→BFS drive ${bhdToBfs} + turnaround 10 = ${neededAfterLarne} needed`,
      `earliest ready at BFS ${at0740.diagnostics.earliestReadyAfterPreviousLocal}`,
      `proposed pickup ${at0740.diagnostics.requestedPickupLocal} / on-site deadline ${at0740.diagnostics.proposedOnSiteDeadlineLocal}`,
      `10 Sep next booking is identified but is not the conflict`,
    ].join("; "),
  );

  // Live-shaped paid booking: stolen BHD coords + stored 14-minute route.
  // Pickup is recovered to Larne; stored duration 14 is still used. Overlap
  // remains the first reason — do not rewrite duration just to change 07:40.
  const fromPaid = occupiedJobsFromPaidBooking({
    id: "TAAA4672EAN-LIVE",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    tripDate: MONDAY,
    tripTime: "07:00",
    airportCode: "BHD",
    pickupLat: BHD.lat,
    pickupLng: BHD.lng,
    dropoffLat: BHD.lat,
    dropoffLng: BHD.lng,
    routeDurationMinutes: 14,
  });
  const live0740 = evaluateSmartAvailability({
    requested: requested0740,
    occupied: [...fromPaid, laterOn10Sep],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(live0740.diagnostics.previousBookingId, "TAAA4672EAN-LIVE");
  assert.equal(live0740.diagnostics.previousBookingDurationMinutes, 14);
  assert.equal(live0740.diagnostics.previousBookingCompletionLocal, `${MONDAY}T07:14`);
  assert.equal(live0740.diagnostics.previousBookingOperationalEndLocal, `${MONDAY}T07:29`);
  assert.equal(live0740.diagnostics.previousBookingDestination, "George Best Belfast City Airport");
  assert.equal(live0740.diagnostics.previousPositioningMinutes, bhdToBfs);
  assert.equal(live0740.available, false);
  assert.equal(live0740.reason, SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING);
  assert.equal(live0740.diagnostics.conflictKind, "overlap");
  assert.equal(live0740.diagnostics.conflictBookingId, "TAAA4672EAN-LIVE");
  assert.equal(live0740.diagnostics.sameCalendarDayAsNext, false);
  console.log(
    `OK  live-shaped 14-min stored duration still overlap (finish 07:14, operational end 07:29, ready ${live0740.diagnostics.earliestReadyAfterPreviousLocal})`,
  );
}

console.log("\n=== After-Larne positioning starts at 07:33 completion, not 07:48 operational end ===");
{
  // Live diagnostic: 33-minute Larne→BHD, finish 07:33, operational end 07:48.
  // Intended rule (unchanged): drive + turnaround starts at drop-off.
  // 07:33 + 39 + 10 = 08:22. 07:48 + 39 + 10 = 08:37 would double-count the 15-min pad.
  const larneAt0700: SmartOccupiedJob = {
    id: "TAAA4672EAN-33",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    pickup: LARNE,
    dropoff: BHD,
    tripDate: MONDAY,
    tripTime: "07:00",
    durationMinutes: 33,
    airportCode: "BHD",
  };
  const requested = {
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    durationMinutes: 30,
    airportCode: "BFS" as const,
    isFromAirport: true,
  };
  const bhdToBfs = repositionMinutes(BHD, BFS, {
    fromLabel: "George Best Belfast City Airport",
    toLabel: "Belfast International Airport",
  });
  assert.equal(bhdToBfs, 39);
  assert.equal(positioningTimeNeededMinutes(bhdToBfs, 10), 49);

  const at0740 = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "07:40" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(at0740.diagnostics.previousBookingDurationMinutes, 33);
  assert.equal(at0740.diagnostics.previousBookingCompletionLocal, `${MONDAY}T07:33`);
  assert.equal(at0740.diagnostics.previousBookingOperationalEndLocal, `${MONDAY}T07:48`);
  assert.equal(at0740.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T08:22`);
  assert.notEqual(at0740.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T08:37`);
  assert.equal(at0740.diagnostics.proposedAirportBufferMinutes, 30);
  assert.equal(at0740.diagnostics.earliestBookablePassengerLocal, `${MONDAY}T08:52`);
  assert.equal(at0740.available, false);

  // Typing 08:22 as the passenger time is not the boundary. BFS needs you
  // on site 30 minutes earlier (07:52), but the driver is not ready until 08:22.
  const at0822 = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "08:22" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(at0822.diagnostics.proposedOnSiteDeadlineLocal, `${MONDAY}T07:52`);
  assert.equal(at0822.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T08:22`);
  assert.equal(at0822.available, false);
  assert.equal(at0822.reason, SMART_OPS_REASON.CONFLICT_POSITIONING_TIME);

  const at0821 = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "08:21" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(at0821.available, false);

  // Same proposed airport job: on-site deadline is passenger time − 30.
  // Driver ready 08:22 → passenger boundary is 08:52 / 08:51, not 08:22 / 08:21.
  const at0852 = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "08:52" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(at0852.diagnostics.proposedOnSiteDeadlineLocal, `${MONDAY}T08:22`);
  assert.equal(at0852.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T08:22`);
  assert.equal(at0852.diagnostics.earliestBookablePassengerLocal, `${MONDAY}T08:52`);
  assert.equal(at0852.available, true);

  const at0851 = evaluateSmartAvailability({
    requested: { ...requested, tripTime: "08:51" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: new Date("2026-09-06T12:00:00+01:00"),
  });
  assert.equal(at0851.diagnostics.proposedOnSiteDeadlineLocal, `${MONDAY}T08:21`);
  assert.equal(at0851.available, false);
  assert.equal(at0851.reason, SMART_OPS_REASON.CONFLICT_POSITIONING_TIME);
  assert.equal(at0851.diagnostics.conflictKind, "previous_positioning");
  console.log("OK  33-min Larne finish 07:33 → ready 08:22; BFS boundary 08:52 / 08:51");
}

console.log("\n=== Next validation: house, same-airport, sandwich, reverse hop (rules unchanged) ===");
{
  assert.equal(customerFacingSmartOpsEnabled(config), false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartAvailability, false);

  const larneAt0700: SmartOccupiedJob = {
    id: "TAAA4672EAN-33",
    pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
    dropoffLabel: "George Best Belfast City Airport",
    pickup: LARNE,
    dropoff: BHD,
    tripDate: MONDAY,
    tripTime: "07:00",
    durationMinutes: 33,
    airportCode: "BHD",
  };
  const now = new Date("2026-09-06T12:00:00+01:00");

  // 1. Other direction of the airport buffer: house pickup after Larne→BHD.
  // BHD→City 14 + 10 = 24. Ready 07:57. No +30. Boundary 07:57 / 07:56.
  const bhdToCity = repositionMinutes(BHD, BELFAST, {
    fromLabel: "George Best Belfast City Airport",
    toLabel: "Belfast City Centre",
  });
  assert.equal(bhdToCity, 14);
  assert.equal(positioningTimeNeededMinutes(bhdToCity, 10), 24);
  const house = {
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    pickup: BELFAST,
    dropoff: BFS,
    tripDate: MONDAY,
    durationMinutes: 30,
  };
  const house0757 = evaluateSmartAvailability({
    requested: { ...house, tripTime: "07:57" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(house0757.diagnostics.proposedAirportBufferMinutes, 0);
  assert.equal(house0757.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T07:57`);
  assert.equal(house0757.diagnostics.earliestBookablePassengerLocal, `${MONDAY}T07:57`);
  assert.equal(house0757.available, true);

  const house0756 = evaluateSmartAvailability({
    requested: { ...house, tripTime: "07:56" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(house0756.available, false);
  assert.equal(house0756.reason, SMART_OPS_REASON.CONFLICT_POSITIONING_TIME);
  assert.equal(house0756.diagnostics.conflictKind, "previous_positioning");

  // 2. Same-airport continuation: BHD pickup after Larne→BHD. Drive 0 + 10
  // turnaround → driver-ready 07:43, positioning-only passenger 08:13.
  // Binding constraint is overlap: previous operational window ends 07:48,
  // BHD airport on-site is passenger − 30, so 08:18 / 08:17.
  const sameAirport = {
    pickupLabel: "George Best Belfast City Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BHD,
    dropoff: BELFAST,
    tripDate: MONDAY,
    durationMinutes: 20,
    airportCode: "BHD" as const,
    isFromAirport: true,
  };
  const bhd0813 = evaluateSmartAvailability({
    requested: { ...sameAirport, tripTime: "08:13" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(bhd0813.diagnostics.previousPositioningMinutes, 0);
  assert.equal(bhd0813.diagnostics.previousPositioningNeededMinutes, 10);
  assert.equal(bhd0813.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T07:43`);
  assert.equal(bhd0813.diagnostics.earliestBookablePassengerLocal, `${MONDAY}T08:13`);
  assert.equal(bhd0813.available, false);
  assert.equal(bhd0813.reason, SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING);
  assert.equal(bhd0813.diagnostics.conflictKind, "overlap");

  const bhd0818 = evaluateSmartAvailability({
    requested: { ...sameAirport, tripTime: "08:18" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(bhd0818.diagnostics.proposedOnSiteDeadlineLocal, `${MONDAY}T07:48`);
  assert.equal(bhd0818.available, true);

  const bhd0817 = evaluateSmartAvailability({
    requested: { ...sameAirport, tripTime: "08:17" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(bhd0817.available, false);
  assert.equal(bhd0817.reason, SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING);
  assert.equal(bhd0817.diagnostics.conflictKind, "overlap");

  // 3. Sandwich: Larne 07:00 and a 10:00 City Centre house job.
  // After-Larne BFS floor remains 08:52. Proposed operational end is pickup+45,
  // exclusive vs 10:00, so 09:15 is the last BFS pickup that does not overlap 10:00.
  const cityAt1000: SmartOccupiedJob = {
    id: "JOB-CITY-1000",
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    pickup: BELFAST,
    dropoff: BFS,
    tripDate: MONDAY,
    tripTime: "10:00",
    durationMinutes: 20,
  };
  const bfsBetween = {
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    durationMinutes: 30,
    airportCode: "BFS" as const,
    isFromAirport: true,
  };
  const sandwich0852 = evaluateSmartAvailability({
    requested: { ...bfsBetween, tripTime: "08:52" },
    occupied: [larneAt0700, cityAt1000],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(sandwich0852.available, true);
  assert.equal(sandwich0852.diagnostics.previousBookingId, "TAAA4672EAN-33");
  assert.equal(sandwich0852.diagnostics.nextBookingId, "JOB-CITY-1000");

  const sandwich0851 = evaluateSmartAvailability({
    requested: { ...bfsBetween, tripTime: "08:51" },
    occupied: [larneAt0700, cityAt1000],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(sandwich0851.available, false);
  assert.equal(sandwich0851.reason, SMART_OPS_REASON.CONFLICT_POSITIONING_TIME);

  const sandwich0915 = evaluateSmartAvailability({
    requested: { ...bfsBetween, tripTime: "09:15" },
    occupied: [larneAt0700, cityAt1000],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(sandwich0915.diagnostics.operationalEndLocal, `${MONDAY}T10:00`);
  assert.equal(sandwich0915.available, true);

  const sandwich0916 = evaluateSmartAvailability({
    requested: { ...bfsBetween, tripTime: "09:16" },
    occupied: [larneAt0700, cityAt1000],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(sandwich0916.available, false);
  assert.equal(sandwich0916.reason, SMART_OPS_REASON.CONFLICT_NEXT_BOOKING);
  assert.equal(sandwich0916.diagnostics.conflictBookingId, "JOB-CITY-1000");
  assert.match(String(sandwich0916.diagnostics.conflictSummary), /Overlap/i);

  // 4. Reverse hop: after 05:45 BFS→City, a BHD airport pickup.
  // City→BHD 14 + 10 = 24. Ready 06:39. Airport +30 → 07:09 / 07:08.
  const bfsAt0545: SmartOccupiedJob = {
    id: "JOB-BFS-0545",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BFS,
    dropoff: BELFAST,
    tripDate: MONDAY,
    tripTime: "05:45",
    durationMinutes: 30,
    airportCode: "BFS",
    isFromAirport: true,
  };
  const bhdAfterBfs = {
    pickupLabel: "George Best Belfast City Airport",
    dropoffLabel: "Belfast City Centre",
    pickup: BHD,
    dropoff: BELFAST,
    tripDate: MONDAY,
    durationMinutes: 20,
    airportCode: "BHD" as const,
    isFromAirport: true,
  };
  const reverse0709 = evaluateSmartAvailability({
    requested: { ...bhdAfterBfs, tripTime: "07:09" },
    occupied: [bfsAt0545],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(reverse0709.diagnostics.previousPositioningMinutes, 14);
  assert.equal(reverse0709.diagnostics.earliestReadyAfterPreviousLocal, `${MONDAY}T06:39`);
  assert.equal(reverse0709.diagnostics.earliestBookablePassengerLocal, `${MONDAY}T07:09`);
  assert.equal(reverse0709.available, true);

  const reverse0708 = evaluateSmartAvailability({
    requested: { ...bhdAfterBfs, tripTime: "07:08" },
    occupied: [bfsAt0545],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(reverse0708.available, false);
  assert.equal(reverse0708.reason, SMART_OPS_REASON.CONFLICT_POSITIONING_TIME);

  // 5. Next calendar day is not blocked by Monday Larne.
  const tuesday = addDaysYmd(MONDAY, 1);
  const nextDay = evaluateSmartAvailability({
    requested: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      pickup: BFS,
      dropoff: BELFAST,
      tripDate: tuesday,
      tripTime: "07:40",
      durationMinutes: 30,
      airportCode: "BFS",
      isFromAirport: true,
    },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now,
  });
  assert.equal(nextDay.available, true);
  assert.equal(nextDay.diagnostics.sameCalendarDayAsNext, null);

  console.log(
    "OK  house 07:57/07:56; same-airport overlap 08:18/08:17; sandwich 08:52–09:15; reverse 07:09/07:08; next day open",
  );
}

console.log("\nAll Smart Availability / Smart Return checks passed.");
