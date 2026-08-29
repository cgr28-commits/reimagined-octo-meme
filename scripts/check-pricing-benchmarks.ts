/**
 * Benchmark calibration validation table (PR #435 universal distance targets).
 * Run: npx tsx scripts/check-pricing-benchmarks.ts
 */

import assert from "node:assert/strict";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  calculatePointToPointQuote,
  calculateQuote,
  getA2aDistanceAdjustmentGbp,
} from "../src/lib/quote";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";
import { roundGbp } from "../shared/gbp";
import {
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
} from "../shared/universal-distance-pricing";

const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;
const hall = "Belfast City Hall, Belfast BT1 5GS";
const belfast = "10 Donegall Square North, Belfast BT1 5GB";

function metricsForMiles(miles: number, durationMinutes = 40) {
  return { distanceKm: miles / 0.621371, durationMinutes };
}

/** Approx OSRM loaded distances from central Belfast (for reporting). */
const ROUTES = [
  {
    name: "City Hall → BHD",
    kind: "airport" as const,
    airport: "BHD" as const,
    address: hall,
    miles: 4.5,
    metrics: metricsForMiles(4.5, 12),
    oldS: 35,
    oldE: 45,
    targetS: calculateUniversalSaloonJourneyFareGbp(4.5),
    targetE: calculateUniversalEstateJourneyFareGbp(
      calculateUniversalSaloonJourneyFareGbp(4.5),
    ),
  },
  {
    name: "City Hall → BFS",
    kind: "airport" as const,
    airport: "BFS" as const,
    address: hall,
    miles: 14,
    metrics: metricsForMiles(14, 25),
    oldS: 55,
    oldE: 65,
    targetS: 48,
    targetE: 54,
  },
  {
    name: "City Hall → Dublin Airport",
    kind: "airport" as const,
    airport: "DUB" as const,
    address: hall,
    miles: 98,
    metrics: metricsForMiles(98, 115),
    oldS: 230,
    oldE: 240,
    // Journey £230 + DUB drop £4; estate journey £236 + £4
    targetS: 234,
    targetE: 240,
  },
  {
    name: "City Hall → Newry",
    kind: "a2a" as const,
    dropoff: "1 Marcus Square, Newry BT35 8DQ",
    miles: Math.round(universalDrivingMilesFromKm(59.9)),
    km: 59.9,
    mins: 46,
    oldS: 75,
    oldE: 85,
    targetS: calculateUniversalSaloonJourneyFareGbp(universalDrivingMilesFromKm(59.9)),
    targetE: calculateUniversalEstateJourneyFareGbp(
      calculateUniversalSaloonJourneyFareGbp(universalDrivingMilesFromKm(59.9)),
    ),
  },
  {
    name: "City Hall → Derry",
    kind: "a2a" as const,
    dropoff: "1 Guildhall Square, Derry BT48 6BJ",
    miles: Math.round(universalDrivingMilesFromKm(114.1)),
    km: 114.1,
    mins: 86,
    oldS: 115,
    oldE: 135,
    targetS: calculateUniversalSaloonJourneyFareGbp(universalDrivingMilesFromKm(114.1)),
    targetE: calculateUniversalEstateJourneyFareGbp(
      calculateUniversalSaloonJourneyFareGbp(universalDrivingMilesFromKm(114.1)),
    ),
  },
  {
    name: "City Hall → Enniskillen",
    kind: "a2a" as const,
    dropoff: "10 East Bridge Street, Enniskillen, BT74 7AB",
    miles: Math.round(universalDrivingMilesFromKm(130.2)),
    km: 130.2,
    mins: 98,
    oldS: 125,
    oldE: 145,
    targetS: calculateUniversalSaloonJourneyFareGbp(universalDrivingMilesFromKm(130.2)),
    targetE: calculateUniversalEstateJourneyFareGbp(
      calculateUniversalSaloonJourneyFareGbp(universalDrivingMilesFromKm(130.2)),
    ),
  },
];

type Row = {
  route: string;
  miles: number;
  oldS: number;
  newS: number;
  oldE: number;
  newE: number;
  targetS: number;
  targetE: number;
};

const rows: Row[] = [];

for (const route of ROUTES) {
  let newS: number | null | undefined;
  let newE: number | null | undefined;
  if (route.kind === "airport") {
    newS = calculateQuote(route.address, route.airport, SALOON, false, {}, route.metrics)?.amount;
    newE = calculateQuote(route.address, route.airport, ESTATE, false, {}, route.metrics)?.amount;
  } else {
    const metrics = { distanceKm: route.km, durationMinutes: route.mins };
    newS = calculatePointToPointQuote(belfast, route.dropoff, SALOON, false, {}, metrics)?.amount;
    newE = calculatePointToPointQuote(belfast, route.dropoff, ESTATE, false, {}, metrics)?.amount;
  }
  assert.ok(newS && newE, `${route.name} must produce saloon and estate fares`);
  rows.push({
    route: route.name,
    miles: route.miles,
    oldS: route.oldS,
    newS,
    oldE: route.oldE,
    newE,
    targetS: route.targetS,
    targetE: route.targetE,
  });
}

console.log("\n=== Validation table ===");
console.log(
  "Route".padEnd(32),
  "Mi".padStart(4),
  "Old S".padStart(6),
  "New S".padStart(6),
  "Old E".padStart(6),
  "New E".padStart(6),
  "Tgt S".padStart(6),
  "Tgt E".padStart(6),
);
for (const row of rows) {
  console.log(
    row.route.padEnd(32),
    String(row.miles).padStart(4),
    `£${row.oldS}`.padStart(6),
    `£${row.newS}`.padStart(6),
    `£${row.oldE}`.padStart(6),
    `£${row.newE}`.padStart(6),
    `£${row.targetS}`.padStart(6),
    `£${row.targetE}`.padStart(6),
  );
}

function exact(actual: number, target: number, label: string) {
  assert.equal(actual, target, `${label}: expected £${target}, got £${actual}`);
}

exact(rows[0].newS, 31, "City Hall → BHD S");
exact(rows[0].newE, 37, "City Hall → BHD E");
exact(rows[1].newS, 48, "City Hall → BFS S");
exact(rows[1].newE, 54, "City Hall → BFS E");
exact(rows[2].newS, 234, "City Hall → DUB S");
exact(rows[2].newE, 240, "City Hall → DUB E");
exact(rows[3].newS, rows[3].targetS, "Newry S");
exact(rows[3].newE, rows[3].targetE, "Newry E");
exact(rows[4].newS, rows[4].targetS, "Derry S");
exact(rows[4].newE, rows[4].targetE, "Derry E");
exact(rows[5].newS, rows[5].targetS, "Enniskillen S");
exact(rows[5].newE, rows[5].targetE, "Enniskillen E");

// BFS → Enniskillen (~81 mi via metrics)
{
  const miles = 81;
  const metrics = metricsForMiles(miles, 98);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(miles);
  const expectedE = calculateUniversalEstateJourneyFareGbp(expectedS);
  const bfsEnniS = calculateQuote(
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    "BFS",
    SALOON,
    false,
    {},
    metrics,
  )?.amount;
  const bfsEnniE = calculateQuote(
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    "BFS",
    ESTATE,
    false,
    {},
    metrics,
  )?.amount;
  assert.ok(bfsEnniS && bfsEnniE);
  exact(bfsEnniS, expectedS, "BFS → Enniskillen S");
  exact(bfsEnniE, expectedE, "BFS → Enniskillen E");
  console.log(`OK  BFS → Enniskillen S £${bfsEnniS} / E £${bfsEnniE}`);
}

assert.equal(PRICING_CONFIG.universalDistancePricing?.enabled, true);
assert.equal(PRICING_CONFIG.universalDistancePricing?.estatePremiumGbp, 6);
// Historical config retained
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportEstatePremiumGbp, 8);
assert.equal(PRICING_CONFIG.airportEstatePremiumTiers?.shortPremiumGbp, 5);
assert.equal(PRICING_CONFIG.airportEstatePremiumTiers?.longPremiumGbp, 24);
assert.equal(PRICING_CONFIG.airportOtsCalibration?.undercutMinGbp, 3);
assert.equal(PRICING_CONFIG.airportOtsCalibration?.undercutMaxGbp, 5);
assert.equal(PRICING_CONFIG.returnJourneyDiscountRate, 0.05);

assert.equal(getA2aDistanceAdjustmentGbp(40), -9);
assert.equal(getA2aDistanceAdjustmentGbp(60), -1);
assert.equal(getA2aDistanceAdjustmentGbp(114), 0);
assert.equal(getA2aDistanceAdjustmentGbp(130), 8);

assert.equal(
  calculatePointToPointQuote(belfast, "1 Marcus Square, Newry BT35 8DQ", SALOON),
  null,
  "A2A without route metrics must not invent a fare",
);
assert.equal(
  calculatePointToPointQuote(belfast, "Enniskillen BT74", SALOON, false, {}, {
    distanceKm: 0,
    durationMinutes: 0,
  }),
  null,
  "Invalid zero-length route must not invent a fare",
);

{
  const m = metricsForMiles(14, 25);
  const oneWay = calculateQuote(hall, "BFS", SALOON, false, {}, m);
  assert.equal(oneWay?.amount, 48);
  const ret = calculateQuote(hall, "BFS", SALOON, true, {}, m);
  assert.equal(roundGbp(getReturnJourneyFare(48)), 91.2);
  // Journey £48 × 1.9 = £91.20; fixed costs £0
  assert.equal(ret?.amount, 91.2, "BFS return: 5% on journey only; no fixed-cost add-on");
}

assert.equal(selectVehicleForParty(2, 2), SALOON);
assert.equal(selectVehicleForParty(3, 0), SALOON);
assert.equal(selectVehicleForParty(3, 2), SALOON);
assert.equal(selectVehicleForParty(4, 2), SALOON);
assert.equal(selectVehicleForParty(1, 3), ESTATE);
assert.equal(selectVehicleForParty(5, 1), MINIBUS_VEHICLE);
assert.equal(requiresMinibus(2, 5), true);

console.log("\nOK  Universal distance benchmarks, return discount, vehicle rules");
console.log("All pricing benchmark checks passed.");
