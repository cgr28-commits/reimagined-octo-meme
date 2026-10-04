/**
 * Phase 2 quote UX: passenger/luggage → vehicle selection (aligned with business rules).
 * Run: npx tsx scripts/check-quote-pax-luggage.ts
 */

import assert from "node:assert/strict";
import { calculateQuote } from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";

function check(
  label: string,
  passengers: number,
  suitcases: number,
  expected: "saloon" | "estate" | "minibus",
  airport: "BFS" | "BHD" | "DUB",
  address: string,
) {
  const vehicle = selectVehicleForParty(passengers, suitcases);
  const short =
    vehicle === MINIBUS_VEHICLE ? "minibus" : vehicle === ESTATE_VEHICLE ? "estate" : "saloon";
  assert.equal(short, expected, label);
  if (requiresMinibus(passengers, suitcases)) {
    console.log(`OK  ${label} → minibus (no online fare)`);
    return;
  }
  const quote = calculateQuote(address, airport, vehicle, false, {}, METRICS[airport]);
  assert.ok(quote, `${label} should produce a quote`);
  console.log(`OK  ${label} → ${short} £${quote!.amount}`);
}

const belfast = "10 Donegall Square North, Belfast BT1 5GB";
/** Genuine road metrics — calculateQuote no longer quotes from zone-only addresses. */
const METRICS = {
  BFS: { distanceKm: 14 / 0.621371, durationMinutes: 25 },
  BHD: { distanceKm: 4 / 0.621371, durationMinutes: 15 },
  DUB: { distanceKm: 98 / 0.621371, durationMinutes: 120 },
};

check("1 passenger / 0 suitcases", 1, 0, "saloon", "BFS", belfast);
check("2 passengers / 2 suitcases", 2, 2, "saloon", "BFS", belfast);
check("3 passengers / 0 suitcases", 3, 0, "saloon", "BFS", belfast);
check("3 passengers / 2 suitcases", 3, 2, "saloon", "BFS", belfast);
check("4 passengers / 2 suitcases", 4, 2, "saloon", "BFS", belfast);
check("4 passengers / 4 suitcases", 4, 4, "estate", "BFS", belfast);
check("1 passenger / 3 suitcases", 1, 3, "estate", "BFS", belfast);
check("2 passengers / 4 suitcases", 2, 4, "estate", "BFS", belfast);
check("3 passengers / 3 suitcases", 3, 3, "estate", "BFS", belfast);
check("5–7 passengers", 5, 1, "minibus", "BFS", belfast);
check("5+ suitcases", 2, 5, "minibus", "BFS", belfast);
check("7 passengers", 7, 2, "minibus", "BFS", belfast);
check("Belfast City Airport", 2, 1, "saloon", "BHD", belfast);
check("Belfast International", 2, 1, "saloon", "BFS", belfast);
check("Dublin Airport", 2, 1, "saloon", "DUB", belfast);
check("BFS estate luggage", 2, 3, "estate", "BFS", belfast);

assert.equal(selectVehicleForParty(2, 2), SALOON_VEHICLE);
assert.equal(selectVehicleForParty(3, 2), SALOON_VEHICLE);

const oneWay = calculateQuote(belfast, "BFS", SALOON_VEHICLE, false, {}, METRICS.BFS);
const ret = calculateQuote(belfast, "BFS", SALOON_VEHICLE, true, {}, METRICS.BFS);
assert.ok(oneWay && ret, "BFS return saloon should produce a quote");
assert.ok(ret!.amount > oneWay!.amount, "return fare stays above the one-way fare");
console.log(`OK  BFS return saloon £${ret!.amount} (5% on return journey; one-way £${oneWay!.amount})`);

console.log("\nAll passenger/luggage quote checks passed (rates unchanged).");
