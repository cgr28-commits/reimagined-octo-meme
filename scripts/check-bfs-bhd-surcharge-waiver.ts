/**
 * BFS/BHD access + A2A fixed costs under universal distance pricing.
 * Legacy embed strip is retired (returns 0). Journey = road miles only.
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
import { calculateUniversalSaloonJourneyFareGbp } from "../shared/universal-distance-pricing";

const S = SALOON_VEHICLE;
const CITY = "Belfast City Hall, Belfast BT1 5GS";
const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;
const M17 = { distanceKm: 17 / 0.621371, durationMinutes: 32 };
const M4 = { distanceKm: 4 / 0.621371, durationMinutes: 12 };
/** Belfast centre → DUB ~98 road miles (long-distance calibration). */
const M98 = { distanceKm: 98 / 0.621371, durationMinutes: 120 };

assert.equal(NI_AIRPORT_ACCESS_SURCHARGE_GBP.BFS, 5);
assert.equal(NI_AIRPORT_ACCESS_SURCHARGE_GBP.BHD, 4);
assert.equal(getAirportLegFixedCostGbp("BFS", false), 0);
assert.equal(getAirportLegFixedCostGbp("BHD", false), 0);
assert.equal(getAirportLegFixedCostGbp("DUB", false), 4);
assert.equal(getAirportLegFixedCostGbp("DUB", true), 9);
// Legacy strip retired under universal distance pricing.
assert.equal(getLegacyEmbeddedAccessFeeGbp("BFS"), 0);
assert.equal(getLegacyEmbeddedAccessFeeGbp("BHD"), 0);

// Address ↔ airport: ~4 mi → £30 journey (no embed strip)
assert.equal(calculateQuote(CITY, "BFS", S, false, {}, M4, false)!.amount, 30);
assert.equal(calculateQuote(CITY, "BHD", S, false, {}, M4, false)!.amount, 30);
assert.equal(calculateQuote(CITY, "BFS", S, false, {}, null, false), null);

// A2A: collection-only waiver of historical surcharge (destination keeps fee)
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
assert.equal(underlying.amount, calculateUniversalSaloonJourneyFareGbp(17));
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
assert.equal(bfsBhd.journeyFareGbp, underlying.amount);
assert.equal(bfsBhd.airportFixedCostsGbp, 4);
assert.equal(bhdBfs.airportFixedCostsGbp, 5);
assert.equal(bfsBhd.amount, underlying.amount + 4);
assert.equal(bhdBfs.amount, underlying.amount + 5);

// Dublin: ~98 mi → £230 journey + fixed
const dubDrop = calculateQuote(CITY, "DUB", S, false, {}, M98, false)!;
const dubPick = calculateQuote(CITY, "DUB", S, false, {}, M98, true)!;
assert.equal(dubDrop.journeyFareGbp, 230);
assert.equal(dubDrop.airportFixedCostsGbp, 4);
assert.equal(dubDrop.amount, 234);
assert.equal(dubPick.airportFixedCostsGbp, 9);
assert.equal(dubPick.amount, 239);

console.log("OK  universal distance + A2A fixed costs + Dublin fixed costs");
