/**
 * Airport fixed costs (fees / parking / M1 tolls) — calculation + wording.
 * Run: npx tsx scripts/check-airport-fixed-costs.ts
 */
import assert from "node:assert/strict";
import {
  calculateAirportToAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
} from "../src/lib/quote";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import {
  composeFareWithAirportFixedCosts,
  getAirportLegFixedCostGbp,
  getLegacyEmbeddedAccessFeeGbp,
  AIRPORT_FIXED_COSTS_GBP,
} from "../shared/airport-fixed-costs";
import {
  getAirportTripInclusions,
  getAddressToAddressInclusions,
} from "../shared/journey-inclusions";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const S = SALOON_VEHICLE;
const E = ESTATE_VEHICLE;
const CITY = "Belfast City Hall, Belfast BT1 5GS";
const ANTRIM = "17 High Street, Antrim BT41 4BB";
const BANGOR = "Main Street, Bangor BT20 5ED";

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

check("Config: BFS £5/£5, BHD £4/£4, DUB £4 drop / £8 pickup, LDY £0/£0", () => {
  assert.equal(getAirportLegFixedCostGbp("BFS", false), 5);
  assert.equal(getAirportLegFixedCostGbp("BFS", true), 5);
  assert.equal(getAirportLegFixedCostGbp("BHD", false), 4);
  assert.equal(getAirportLegFixedCostGbp("BHD", true), 4);
  assert.equal(getAirportLegFixedCostGbp("DUB", false), 4);
  assert.equal(getAirportLegFixedCostGbp("DUB", true), 8);
  assert.equal(getAirportLegFixedCostGbp("LDY", false), 0);
  assert.equal(getAirportLegFixedCostGbp("LDY", true), 0);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.dropOffFeeGbp, 0);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.parkingAllowanceGbp, 4);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.tollAllowanceGbp, 4);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.BFS?.dropOffFeeGbp, 5);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.DUB?.tollAllowanceGbp, 4);
});

check("BFS drop-off and pickup (Antrim strip+re-add keeps commercial total)", () => {
  const drop = calculateQuote(ANTRIM, "BFS", S, false, {}, null, false)!;
  const pick = calculateQuote(ANTRIM, "BFS", S, false, {}, null, true)!;
  assert.equal(drop.airportFixedCostsGbp, 5);
  assert.equal(pick.airportFixedCostsGbp, 5);
  assert.ok(drop.journeyFareGbp !== undefined);
  assert.equal(drop.amount, (drop.journeyFareGbp ?? 0) + 5);
  assert.equal(pick.amount, (pick.journeyFareGbp ?? 0) + 5);
  // Same direction fees on BFS → totals match either direction for one-way.
  assert.equal(drop.amount, pick.amount);
});

check("BHD drop-off and pickup (City Hall £34; Antrim £69)", () => {
  const cityDrop = calculateQuote(CITY, "BHD", S, false, {}, null, false)!;
  const cityPick = calculateQuote(CITY, "BHD", S, false, {}, null, true)!;
  assert.equal(cityDrop.amount, 34);
  assert.equal(cityPick.amount, 34);
  assert.equal(cityDrop.airportFixedCostsGbp, 4);

  const antrimDrop = calculateQuote(ANTRIM, "BHD", S, false, {}, null, false)!;
  const antrimPick = calculateQuote(ANTRIM, "BHD", S, false, {}, null, true)!;
  assert.equal(antrimDrop.amount, 69);
  assert.equal(antrimPick.amount, 69);
  assert.equal(antrimDrop.airportFixedCostsGbp, 4);
});

check("Dublin drop-off £4 M1; pickup £8 parking+M1 (not a drop-off fee)", () => {
  const drop = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  const pick = calculateQuote(CITY, "DUB", S, false, {}, null, true)!;
  assert.equal(drop.airportFixedCostsGbp, 4);
  assert.equal(pick.airportFixedCostsGbp, 8);
  assert.equal(drop.journeyFareGbp, 230);
  assert.equal(pick.journeyFareGbp, 230);
  // Pre-round: 230+4=234 (kept by roundFare £x4 rule); 230+8=238 → snaps to £240.
  assert.equal(drop.amount, 234);
  assert.equal(pick.amount, 240);
  assert.equal(pick.journeyFareGbp! + pick.airportFixedCostsGbp!, 238);
});

check("City of Derry: zero fixed costs either direction", () => {
  const drop = calculateQuote(BANGOR, "LDY", S, false, {}, null, false)!;
  const pick = calculateQuote(BANGOR, "LDY", S, false, {}, null, true)!;
  assert.equal(drop.airportFixedCostsGbp, 0);
  assert.equal(pick.airportFixedCostsGbp, 0);
  assert.equal(drop.amount, drop.journeyFareGbp);
  assert.equal(pick.amount, pick.journeyFareGbp);
  assert.equal(drop.amount, pick.amount);
});

check("Address-to-address: no airport fixed costs", () => {
  const metrics = { distanceKm: 12, durationMinutes: 22 };
  const q = calculatePointToPointQuote(
    "Main Street, Bangor BT20 5ED",
    "Belfast City Hall, Belfast BT1 5GS",
    S,
    false,
    {},
    metrics,
  )!;
  assert.equal(q.airportFixedCostsGbp, undefined);
  const a2aInc = getAddressToAddressInclusions();
  assert.ok(!a2aInc.bullets.some((b) => /airport fee|toll|parking/i.test(b)));
});

check("Return: fixed costs on both legs; 5% discount only on journey fare", () => {
  const oneWay = calculateQuote(CITY, "BFS", S, false, {}, null, false)!;
  const ret = calculateQuote(CITY, "BFS", S, true, {}, null, false)!;

  const embedded = getLegacyEmbeddedAccessFeeGbp("BFS");
  const journeyOneWay = (oneWay.journeyFareGbp ?? 0);
  // one-way journey already excludes fixed cost
  assert.equal(oneWay.airportFixedCostsGbp, 5);
  assert.equal(journeyOneWay + 5, oneWay.amount);

  const expectedJourney = getReturnJourneyFare(journeyOneWay);
  const expectedFixed = 5 + 5; // outbound drop-off + return pickup
  assert.equal(ret.journeyFareGbp, expectedJourney);
  assert.equal(ret.airportFixedCostsGbp, expectedFixed);
  assert.equal(ret.amount, expectedJourney + expectedFixed);

  // Discount must NOT apply to the £10 fixed block.
  const wronglyDiscountedFixed = getReturnJourneyFare(journeyOneWay + embedded);
  assert.notEqual(ret.amount, wronglyDiscountedFixed);
  assert.ok(ret.amount > wronglyDiscountedFixed - 0.01);

  const composed = composeFareWithAirportFixedCosts({
    journeyOneWayGbp: journeyOneWay,
    returnJourney: true,
    outboundFixedGbp: 5,
    returnFixedGbp: 5,
    getReturnJourneyFare,
  });
  assert.equal(composed.fixedTotalGbp, 10);
  assert.equal(composed.journeyTotalGbp, expectedJourney);
});

check("Airport costs are not multiplied by vehicle / estate premium", () => {
  const saloon = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  const estate = calculateQuote(CITY, "DUB", E, false, {}, null, false)!;
  assert.equal(saloon.airportFixedCostsGbp, 4);
  assert.equal(estate.airportFixedCostsGbp, 4);
  // Estate uplift lives in journey fare only — fixed block identical.
  assert.ok((estate.journeyFareGbp ?? 0) > (saloon.journeyFareGbp ?? 0));
  assert.equal(
    estate.journeyFareGbp! - saloon.journeyFareGbp!,
    estate.vehicleAdjustment - saloon.vehicleAdjustment,
  );
});

check("Airport↔airport adds both-end fixed costs once per direction (no stack on A2A)", () => {
  const metrics = { distanceKm: 17 / 0.621371, durationMinutes: 32 };
  const underlying = calculatePointToPointQuote(
    bfs.formattedAddress,
    bhd.formattedAddress,
    S,
    false,
    {},
    metrics,
  )!;
  const q = calculateAirportToAirportQuote(
    "BFS",
    "BHD",
    bfs.formattedAddress,
    bhd.formattedAddress,
    S,
    false,
    {},
    metrics,
  )!;
  assert.equal(q.airportFixedCostsGbp, 5 + 4);
  assert.equal(q.amount, underlying.amount + 9);

  const ret = calculateAirportToAirportQuote(
    "BFS",
    "BHD",
    bfs.formattedAddress,
    bhd.formattedAddress,
    S,
    true,
    {},
    metrics,
  )!;
  assert.equal(ret.airportFixedCostsGbp, 9 + 9);
  assert.equal(ret.journeyFareGbp, getReturnJourneyFare(underlying.amount));
  // Customer total may snap via roundFare; composition before rounding is journey + £18.
  assert.equal(ret.journeyFareGbp! + ret.airportFixedCostsGbp!, getReturnJourneyFare(underlying.amount) + 18);
  assert.ok(Math.abs(ret.amount - (ret.journeyFareGbp! + ret.airportFixedCostsGbp!)) <= 3);
});

check("Wording: BFS/BHD direction-specific fee lines", () => {
  const bfsDrop = getAirportTripInclusions({ isFromAirport: false, airportCode: "BFS" });
  assert.ok(bfsDrop.bullets.some((b) => /Airport drop-off fee included/.test(b)));
  assert.ok(!bfsDrop.bullets.some((b) => /pickup fee|waiting/i.test(b)));
  assert.match(bfsDrop.summary, /Airport fees and applicable tolls included/i);

  const bfsPick = getAirportTripInclusions({ isFromAirport: true, airportCode: "BHD" });
  assert.ok(bfsPick.bullets.some((b) => /Airport pickup fee included/.test(b)));
  assert.ok(bfsPick.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!bfsPick.bullets.some((b) => /drop-off/i.test(b)));
});

check("Wording: Dublin drop-off M1 only; pickup parking+M1 + waiting; never drop-off fee", () => {
  const drop = getAirportTripInclusions({ isFromAirport: false, airportCode: "DUB" });
  assert.ok(drop.bullets.some((b) => /M1 tolls included/.test(b)));
  assert.ok(!drop.bullets.some((b) => /drop-off fee|parking|waiting/i.test(b)));

  const pick = getAirportTripInclusions({ isFromAirport: true, airportCode: "DUB" });
  assert.ok(pick.bullets.some((b) => /Airport parking and M1 tolls included/.test(b)));
  assert.ok(pick.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!pick.bullets.some((b) => /drop-off fee/i.test(b)));
});

check("Wording: LDY never shows airport-fee inclusion when charge is zero", () => {
  const drop = getAirportTripInclusions({ isFromAirport: false, airportCode: "LDY" });
  assert.ok(!drop.bullets.some((b) => /fee|toll|parking/i.test(b)));
  assert.doesNotMatch(drop.summary, /fee|toll/i);

  const pick = getAirportTripInclusions({ isFromAirport: true, airportCode: "LDY" });
  assert.ok(pick.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!pick.bullets.some((b) => /fee|toll|parking/i.test(b)));
});

console.log("\nAll airport fixed-cost checks passed.");
