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
  const quote = calculateQuote(address, airport, vehicle);
  assert.ok(quote, `${label} should produce a quote`);
  console.log(`OK  ${label} → ${short} £${quote!.amount}`);
}

const belfast = "10 Donegall Square North, Belfast BT1 5GB";

check("1 passenger / 0 suitcases", 1, 0, "saloon", "BFS", belfast);
check("2 passengers / 2 suitcases", 2, 2, "saloon", "BFS", belfast);
check("3 passengers / 0 suitcases", 3, 0, "estate", "BFS", belfast);
check("4 passengers / 4 suitcases", 4, 4, "estate", "BFS", belfast);
check("1 passenger / 3 suitcases", 1, 3, "estate", "BFS", belfast);
check("2 passengers / 4 suitcases", 2, 4, "estate", "BFS", belfast);
check("5+ passengers", 5, 1, "minibus", "BFS", belfast);
check("5+ suitcases", 2, 5, "minibus", "BFS", belfast);
check("Belfast City Airport", 2, 1, "saloon", "BHD", belfast);
check("Belfast International", 2, 1, "saloon", "BFS", belfast);
check("Dublin Airport", 2, 1, "saloon", "DUB", belfast);
check("BFS estate luggage", 2, 3, "estate", "BFS", belfast);

assert.equal(selectVehicleForParty(2, 2), SALOON_VEHICLE);
assert.equal(selectVehicleForParty(3, 2), ESTATE_VEHICLE);

const ret = calculateQuote(belfast, "BFS", SALOON_VEHICLE, true);
assert.equal(ret?.amount, 105);
console.log("OK  BFS return saloon £105");

console.log("\nAll passenger/luggage quote checks passed (rates unchanged).");
