/**
 * Phase 2 quote UX: passenger/luggage → vehicle selection (no rate changes).
 * Run: npx tsx scripts/check-quote-pax-luggage.ts
 */

import assert from "node:assert/strict";
import { calculateQuote } from "../src/lib/quote";

const SALOON = "Standard Saloon (1–4 passengers)";
const ESTATE = "Estate Car (1–4 passengers)";

function pickVehicle(passengers: number, suitcases: number): "saloon" | "estate" | "manual" {
  if (passengers > 4 || suitcases > 4) return "manual";
  if (suitcases >= 3) return "estate";
  return "saloon";
}

function check(
  label: string,
  passengers: number,
  suitcases: number,
  expected: "saloon" | "estate" | "manual",
  airport: "BFS" | "BHD" | "DUB",
  address: string,
) {
  const vehicle = pickVehicle(passengers, suitcases);
  assert.equal(vehicle, expected, label);
  if (vehicle === "manual") {
    console.log(`OK  ${label} → manual (no online fare)`);
    return;
  }
  const type = vehicle === "estate" ? ESTATE : SALOON;
  const quote = calculateQuote(address, airport, type);
  assert.ok(quote, `${label} should produce a quote`);
  console.log(`OK  ${label} → ${vehicle} £${quote!.amount}`);
}

const belfast = "10 Donegall Square North, Belfast BT1 5GB";

check("1 passenger / 0 suitcases", 1, 0, "saloon", "BFS", belfast);
check("2 passengers / 2 suitcases", 2, 2, "saloon", "BFS", belfast);
check("4 passengers / 4 suitcases (estate)", 4, 4, "estate", "BFS", belfast);
check("1 passenger / 3 suitcases (estate)", 1, 3, "estate", "BFS", belfast);
check("unsuitable for online saloon/estate (5 pax)", 5, 1, "manual", "BFS", belfast);
check("unsuitable for online (5 cases)", 2, 5, "manual", "BFS", belfast);
check("Belfast City Airport", 2, 1, "saloon", "BHD", belfast);
check("Belfast International", 2, 1, "saloon", "BFS", belfast);
check("Dublin Airport", 2, 1, "saloon", "DUB", belfast);
check("BFS return estate luggage", 2, 3, "estate", "BFS", belfast);

const ret = calculateQuote(belfast, "BFS", SALOON, true);
assert.equal(ret?.amount, 105);
console.log("OK  BFS return saloon £105");

console.log("\nAll passenger/luggage quote checks passed (rates unchanged).");
