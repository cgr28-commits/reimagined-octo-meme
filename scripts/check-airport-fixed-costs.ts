/**
 * Airport fixed costs under universal distance pricing.
 * Run: npx tsx scripts/check-airport-fixed-costs.ts
 */
import assert from "node:assert/strict";
import {
  calculateAirportToAirportQuote,
  calculateQuote,
} from "../src/lib/quote";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import {
  getAirportLegFixedCostGbp,
  getLegacyEmbeddedAccessFeeGbp,
  AIRPORT_FIXED_COSTS_GBP,
} from "../shared/airport-fixed-costs";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import {
  calculateUniversalSaloonJourneyFareGbp,
  calculateUniversalEstateJourneyFareGbp,
} from "../shared/universal-distance-pricing";

const S = SALOON_VEHICLE;
const E = ESTATE_VEHICLE;
const CITY = "Belfast City Hall, Belfast BT1 5GS";
const M4 = { distanceKm: 4 / 0.621371, durationMinutes: 12 };
const M15 = { distanceKm: 15 / 0.621371, durationMinutes: 28 };
const M98 = { distanceKm: 98 / 0.621371, durationMinutes: 120 };
const M17 = { distanceKm: 17 / 0.621371, durationMinutes: 32 };

const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

check("Config: BFS/BHD £0/£0, DUB £4 drop / £9 pickup, LDY £1/£2.50", () => {
  assert.equal(getAirportLegFixedCostGbp("BFS", false), 0);
  assert.equal(getAirportLegFixedCostGbp("BHD", false), 0);
  assert.equal(getAirportLegFixedCostGbp("DUB", false), 4);
  assert.equal(getAirportLegFixedCostGbp("DUB", true), 9);
  assert.equal(getAirportLegFixedCostGbp("LDY", false), 1);
  assert.equal(getAirportLegFixedCostGbp("LDY", true), 2.5);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.tollAllowanceGbp, 4);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.DUB?.parkingAllowanceGbp, 5);
  assert.equal(getLegacyEmbeddedAccessFeeGbp("BFS"), 0);
  assert.equal(getLegacyEmbeddedAccessFeeGbp("BHD"), 0);
});

check("BFS/BHD address↔airport: journey only (no fixed add-on)", () => {
  const drop = calculateQuote(CITY, "BFS", S, false, {}, M15, false)!;
  const pick = calculateQuote(CITY, "BFS", S, false, {}, M15, true)!;
  assert.equal(drop.airportFixedCostsGbp, 0);
  assert.equal(pick.airportFixedCostsGbp, 0);
  assert.equal(drop.amount, calculateUniversalSaloonJourneyFareGbp(15));
  assert.equal(drop.amount, drop.journeyFareGbp);
  assert.equal(pick.amount, drop.amount);

  const bhdCity = calculateQuote(CITY, "BHD", S, false, {}, M4, false)!;
  assert.equal(bhdCity.amount, 30);
  assert.equal(bhdCity.airportFixedCostsGbp, 0);
});

check("Estate = Saloon + £6 on BHD", () => {
  const saloon = calculateQuote(CITY, "BHD", S, false, {}, M4, false)!;
  const estate = calculateQuote(CITY, "BHD", E, false, {}, M4, false)!;
  assert.equal(saloon.amount, 30);
  assert.equal(estate.amount, 36);
  assert.equal(estate.amount - saloon.amount, 6);
  assert.equal(
    estate.amount,
    calculateUniversalEstateJourneyFareGbp(saloon.amount),
  );
});

check("Dublin: universal journey + fixed costs", () => {
  const drop = calculateQuote(CITY, "DUB", S, false, {}, M98, false)!;
  const pick = calculateQuote(CITY, "DUB", S, false, {}, M98, true)!;
  assert.equal(drop.journeyFareGbp, 230);
  assert.equal(pick.journeyFareGbp, 230);
  assert.equal(drop.airportFixedCostsGbp, 4);
  assert.equal(pick.airportFixedCostsGbp, 9);
  assert.equal(drop.amount, 234);
  assert.equal(pick.amount, 239);
});

check("A2A BFS↔BHD keeps destination-end historical surcharge", () => {
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
  assert.equal(bfsBhd.journeyFareGbp, calculateUniversalSaloonJourneyFareGbp(17));
  assert.equal(bfsBhd.airportFixedCostsGbp, 4);
  assert.equal(bfsBhd.amount, bfsBhd.journeyFareGbp! + 4);
});

check("Null metrics refuse fare", () => {
  assert.equal(calculateQuote(CITY, "BFS", S, false, {}, null, false), null);
});

console.log("\nAll airport fixed-cost checks passed.");
