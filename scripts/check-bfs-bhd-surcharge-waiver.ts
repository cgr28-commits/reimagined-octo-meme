/**
 * BFS £5 / BHD £4 access surcharge waiver:
 * - address↔airport: full waiver (−£5 / −£4)
 * - BFS↔BHD A2A: waive collection end only (−£5 or −£4, never −£9)
 * Run: npx tsx scripts/check-bfs-bhd-surcharge-waiver.ts
 */
import assert from "node:assert/strict";
import {
  calculateAirportToAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
} from "../src/lib/quote";
import {
  getAirportLegFixedCostGbp,
  getAirportToAirportFixedCostGbp,
  getLegacyEmbeddedAccessFeeGbp,
  NI_AIRPORT_ACCESS_SURCHARGE_GBP,
} from "../shared/airport-fixed-costs";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const S = SALOON_VEHICLE;
const CITY = "Belfast City Hall, Belfast BT1 5GS";
const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;
const M17 = { distanceKm: 17 / 0.621371, durationMinutes: 32 };

assert.equal(NI_AIRPORT_ACCESS_SURCHARGE_GBP.BFS, 5);
assert.equal(NI_AIRPORT_ACCESS_SURCHARGE_GBP.BHD, 4);
assert.equal(getAirportLegFixedCostGbp("BFS", false), 0);
assert.equal(getAirportLegFixedCostGbp("BHD", false), 0);
assert.equal(getAirportLegFixedCostGbp("DUB", false), 4);
assert.equal(getLegacyEmbeddedAccessFeeGbp("BFS"), 5);
assert.equal(getLegacyEmbeddedAccessFeeGbp("BHD"), 4);

// Address ↔ airport (baseline before waiver: £54 / £34)
assert.equal(calculateQuote(CITY, "BFS", S, false, {}, null, false)!.amount, 49);
assert.equal(calculateQuote(CITY, "BFS", S, false, {}, null, true)!.amount, 49);
assert.equal(calculateQuote(CITY, "BHD", S, false, {}, null, false)!.amount, 30);
assert.equal(calculateQuote(CITY, "BHD", S, false, {}, null, true)!.amount, 30);

// A2A: collection-only waiver
assert.equal(getAirportToAirportFixedCostGbp("BFS", "BHD"), 4);
assert.equal(getAirportToAirportFixedCostGbp("BHD", "BFS"), 5);
const underlying = calculatePointToPointQuote(
  bfs.formattedAddress,
  bhd.formattedAddress,
  S,
  false,
  {},
  M17,
)!;
assert.equal(underlying.amount, 50);
const bfsBhd = calculateAirportToAirportQuote(
  "BFS",
  "BHD",
  bfs.formattedAddress,
  bhd.formattedAddress,
  S,
  false,
  {},
  M17,
)!;
const bhdBfs = calculateAirportToAirportQuote(
  "BHD",
  "BFS",
  bhd.formattedAddress,
  bfs.formattedAddress,
  S,
  false,
  {},
  M17,
)!;
assert.equal(bfsBhd.amount, 54); // was 59 (−£5)
assert.equal(bhdBfs.amount, 55); // was 59 (−£4)
assert.equal(bfsBhd.airportFixedCostsGbp, 4);
assert.equal(bhdBfs.airportFixedCostsGbp, 5);

// Dublin unchanged
assert.equal(calculateQuote(CITY, "DUB", S, false, {}, null, false)!.amount, 234);
assert.equal(calculateQuote(CITY, "DUB", S, false, {}, null, true)!.amount, 240);

console.log("OK  six surcharge-waiver scenarios + Dublin unchanged");
