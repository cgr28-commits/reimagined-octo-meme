/**
 * Benchmark calibration validation table (approved commercial targets).
 * Run: npx tsx scripts/check-pricing-benchmarks.ts
 */

import assert from "node:assert/strict";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  calculatePointToPointQuote,
  calculateQuote,
  getA2aDistanceAdjustmentGbp,
} from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";

const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;
const hall = "Belfast City Hall, Belfast BT1 5GS";
const belfast = "10 Donegall Square North, Belfast BT1 5GB";

/** Approx OSRM loaded distances from central Belfast (for reporting). */
const ROUTES = [
  {
    name: "City Hall → BHD",
    kind: "airport" as const,
    airport: "BHD" as const,
    address: hall,
    miles: 4.5,
    km: 7.2,
    oldS: 35,
    oldE: 45,
    targetS: 29,
    targetE: 34,
  },
  {
    name: "City Hall → BFS",
    kind: "airport" as const,
    airport: "BFS" as const,
    address: hall,
    miles: 14,
    km: 22.5,
    oldS: 55,
    oldE: 65,
    targetS: 55,
    targetE: 64,
  },
  {
    name: "City Hall → Dublin Airport",
    kind: "airport" as const,
    airport: "DUB" as const,
    address: hall,
    miles: 100,
    km: 160,
    oldS: 230,
    oldE: 240,
    targetS: 230,
    targetE: 240,
  },
  {
    name: "City Hall → Newry",
    kind: "a2a" as const,
    dropoff: "1 Marcus Square, Newry BT35 8DQ",
    miles: 37,
    km: 59.9,
    mins: 46,
    oldS: 75,
    oldE: 85,
    targetS: 81,
    targetE: 93,
  },
  {
    name: "City Hall → Derry",
    kind: "a2a" as const,
    dropoff: "1 Guildhall Square, Derry BT48 6BJ",
    miles: 71,
    km: 114.1,
    mins: 86,
    oldS: 115,
    oldE: 135,
    targetS: 127,
    targetE: 146,
  },
  {
    name: "City Hall → Enniskillen",
    kind: "a2a" as const,
    dropoff: "10 East Bridge Street, Enniskillen, BT74 7AB",
    miles: 81,
    km: 130.2,
    mins: 98,
    oldS: 125,
    oldE: 145,
    targetS: 145,
    targetE: 165,
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
    newS = calculateQuote(route.address, route.airport, SALOON)?.amount;
    newE = calculateQuote(route.address, route.airport, ESTATE)?.amount;
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

function near(actual: number, target: number, tol = 5) {
  assert.ok(
    Math.abs(actual - target) <= tol,
    `expected ~£${target} (±£${tol}), got £${actual}`,
  );
}

near(rows[0].newS, 29, 0);
near(rows[0].newE, 34, 2);
near(rows[1].newS, 55, 0);
near(rows[1].newE, 64, 2);
near(rows[2].newS, 230, 0);
near(rows[2].newE, 240, 0);
near(rows[3].newS, 81, 5);
near(rows[3].newE, 93, 5);
near(rows[4].newS, 127, 5);
near(rows[4].newE, 146, 5);
near(rows[5].newS, 145, 5);
near(rows[5].newE, 165, 5);

assert.equal(PRICING_CONFIG.airportBasePricesGbp.BHD, 29);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BHD, 29);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportEstatePremiumGbp, 8);
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

const ret = calculateQuote(hall, "BFS", SALOON, true);
assert.equal(ret?.amount, 105, "BFS return keeps single 5% discount (55*1.9→105)");

assert.equal(selectVehicleForParty(2, 2), SALOON);
assert.equal(selectVehicleForParty(3, 0), ESTATE);
assert.equal(selectVehicleForParty(1, 3), ESTATE);
assert.equal(selectVehicleForParty(5, 1), MINIBUS_VEHICLE);
assert.equal(requiresMinibus(2, 5), true);

console.log("\nOK  Band adjustments, airport benchmarks, return discount, vehicle rules");
console.log("All pricing benchmark checks passed.");
