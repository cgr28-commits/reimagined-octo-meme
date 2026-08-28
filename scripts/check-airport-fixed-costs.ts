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

check("Config: BFS/BHD £0/£0, DUB £4 drop (M1) / £9 pickup (parking+M1), LDY £1/£2.50", () => {
  assert.equal(getAirportLegFixedCostGbp("BFS", false), 0);
  assert.equal(getAirportLegFixedCostGbp("BFS", true), 0);
  assert.equal(getAirportLegFixedCostGbp("BHD", false), 0);
  assert.equal(getAirportLegFixedCostGbp("BHD", true), 0);
  assert.equal(getAirportLegFixedCostGbp("DUB", false), 4);
  assert.equal(getAirportLegFixedCostGbp("DUB", true), 9);
  assert.equal(getAirportLegFixedCostGbp("LDY", false), 1);
  assert.equal(getAirportLegFixedCostGbp("LDY", true), 2.5);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.dropOffFeeGbp, 0);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.parkingAllowanceGbp, 5);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.tollAllowanceGbp, 4);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.BFS?.dropOffFeeGbp, 0);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.DUB?.parkingAllowanceGbp, 5);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.DUB?.tollAllowanceGbp, 4);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.LDY?.dropOffFeeGbp, 1);
  assert.equal(PRICING_CONFIG.airportFixedCostsGbp?.LDY?.pickupFeeGbp, 2.5);
});

check("BFS drop-off and pickup (Antrim £40; legacy strip only — no fixed add-on)", () => {
  const drop = calculateQuote(ANTRIM, "BFS", S, false, {}, null, false)!;
  const pick = calculateQuote(ANTRIM, "BFS", S, false, {}, null, true)!;
  assert.equal(drop.airportFixedCostsGbp, 0);
  assert.equal(pick.airportFixedCostsGbp, 0);
  assert.equal(drop.amount, 40);
  assert.equal(pick.amount, 40);
  assert.equal(drop.amount, drop.journeyFareGbp);
  assert.equal(pick.amount, pick.journeyFareGbp);
  assert.equal(drop.amount, pick.amount);
});

check("BHD drop-off and pickup (City Hall £30; Antrim £65)", () => {
  const cityDrop = calculateQuote(CITY, "BHD", S, false, {}, null, false)!;
  const cityPick = calculateQuote(CITY, "BHD", S, false, {}, null, true)!;
  assert.equal(cityDrop.amount, 30);
  assert.equal(cityPick.amount, 30);
  assert.equal(cityDrop.airportFixedCostsGbp, 0);

  const antrimDrop = calculateQuote(ANTRIM, "BHD", S, false, {}, null, false)!;
  const antrimPick = calculateQuote(ANTRIM, "BHD", S, false, {}, null, true)!;
  assert.equal(antrimDrop.amount, 65);
  assert.equal(antrimPick.amount, 65);
  assert.equal(antrimDrop.airportFixedCostsGbp, 0);
});

check("Dublin drop-off fee £0 + M1 £4; pickup parking £5 + M1 £4 (mandatory)", () => {
  const drop = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  const pick = calculateQuote(CITY, "DUB", S, false, {}, null, true)!;
  assert.equal(drop.airportFixedCostsGbp, 4);
  assert.equal(pick.airportFixedCostsGbp, 9);
  assert.equal(drop.journeyFareGbp, 230);
  assert.equal(pick.journeyFareGbp, 230);
  assert.equal(drop.amount, 234);
  assert.equal(pick.amount, 239);
});

check("City of Derry: drop-off £1; pickup £2.50 (mandatory)", () => {
  const drop = calculateQuote(BANGOR, "LDY", S, false, {}, null, false)!;
  const pick = calculateQuote(BANGOR, "LDY", S, false, {}, null, true)!;
  assert.equal(drop.airportFixedCostsGbp, 1);
  assert.equal(pick.airportFixedCostsGbp, 2.5);
  assert.equal(drop.journeyFareGbp, pick.journeyFareGbp);
  // Final amount is roundFare(journey + fixed); assert fixed costs are direction-correct.
  assert.ok((drop.amount ?? 0) >= (drop.journeyFareGbp ?? 0));
  assert.ok((pick.amount ?? 0) >= (pick.journeyFareGbp ?? 0));
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

check("Return: BFS fixed £0; 5% discount only on journey fare", () => {
  const oneWay = calculateQuote(CITY, "BFS", S, false, {}, null, false)!;
  const ret = calculateQuote(CITY, "BFS", S, true, {}, null, false)!;

  const embedded = getLegacyEmbeddedAccessFeeGbp("BFS");
  const journeyOneWay = oneWay.journeyFareGbp ?? 0;
  assert.equal(oneWay.airportFixedCostsGbp, 0);
  assert.equal(oneWay.amount, journeyOneWay);
  assert.equal(journeyOneWay, 44);

  const expectedJourney = getReturnJourneyFare(journeyOneWay);
  assert.equal(ret.journeyFareGbp, expectedJourney);
  assert.equal(ret.airportFixedCostsGbp, 0);

  // Legacy strip still £5 — without it, discounted return would be higher.
  const unstripJourney = journeyOneWay + embedded;
  assert.equal(unstripJourney, 49);
  assert.ok(getReturnJourneyFare(unstripJourney) > (ret.journeyFareGbp ?? 0));

  const composed = composeFareWithAirportFixedCosts({
    journeyOneWayGbp: journeyOneWay,
    returnJourney: true,
    outboundFixedGbp: 0,
    returnFixedGbp: 0,
    getReturnJourneyFare,
  });
  assert.equal(composed.fixedTotalGbp, 0);
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

check("Airport↔airport BFS↔BHD: waive collection surcharge only (not £9)", () => {
  const metrics = { distanceKm: 17 / 0.621371, durationMinutes: 32 };
  const underlying = calculatePointToPointQuote(
    bfs.formattedAddress,
    bhd.formattedAddress,
    S,
    false,
    {},
    metrics,
  )!;
  const bfsBhd = calculateAirportToAirportQuote(
    "BFS",
    "BHD",
    bfs.formattedAddress,
    bhd.formattedAddress,
    S,
    false,
    {},
    metrics,
  )!;
  // Collection BFS £5 waived; retain BHD destination £4 → underlying+4 (was +9).
  assert.equal(bfsBhd.airportFixedCostsGbp, 4);
  assert.equal(bfsBhd.amount, underlying.amount + 4);

  const bhdBfs = calculateAirportToAirportQuote(
    "BHD",
    "BFS",
    bhd.formattedAddress,
    bfs.formattedAddress,
    S,
    false,
    {},
    metrics,
  )!;
  // Collection BHD £4 waived; retain BFS destination £5 → underlying+5.
  assert.equal(bhdBfs.airportFixedCostsGbp, 5);
  assert.equal(bhdBfs.amount, underlying.amount + 5);

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
  // Outbound destination BHD £4 + return destination BFS £5 = £9.
  assert.equal(ret.airportFixedCostsGbp, 4 + 5);
  assert.equal(ret.journeyFareGbp, getReturnJourneyFare(underlying.amount));
  assert.equal(
    ret.journeyFareGbp! + ret.airportFixedCostsGbp!,
    getReturnJourneyFare(underlying.amount) + 9,
  );
  assert.ok(Math.abs(ret.amount - (ret.journeyFareGbp! + ret.airportFixedCostsGbp!)) <= 3);
});

check("Wording: BFS/BHD like LDY — no fee bullets; pickup still has 60 min waiting", () => {
  const bfsDrop = getAirportTripInclusions({ isFromAirport: false, airportCode: "BFS" });
  assert.ok(!bfsDrop.bullets.some((b) => /fee|toll|parking/i.test(b)));
  assert.doesNotMatch(bfsDrop.summary, /fee|toll/i);

  const bfsPick = getAirportTripInclusions({ isFromAirport: true, airportCode: "BHD" });
  assert.ok(!bfsPick.bullets.some((b) => /fee|toll|parking/i.test(b)));
  assert.ok(bfsPick.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!bfsPick.bullets.some((b) => /drop-off/i.test(b)));
});

check("Wording: Dublin drop-off shows M1 tolls; pickup/parking + M1 + waiting; never drop-off fee", () => {
  const drop = getAirportTripInclusions({ isFromAirport: false, airportCode: "DUB" });
  assert.ok(drop.bullets.some((b) => /M1 tolls/.test(b)));
  assert.ok(!drop.bullets.some((b) => /drop-off fee|parking/i.test(b)));

  const pick = getAirportTripInclusions({ isFromAirport: true, airportCode: "DUB" });
  assert.ok(pick.bullets.some((b) => /pickup\/parking|M1 tolls/.test(b)));
  assert.ok(pick.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!pick.bullets.some((b) => /drop-off fee/i.test(b)));
});

check("Wording: LDY shows direction-specific fee inclusions", () => {
  const drop = getAirportTripInclusions({ isFromAirport: false, airportCode: "LDY" });
  assert.ok(drop.bullets.some((b) => /City of Derry Airport drop-off/.test(b)));

  const pick = getAirportTripInclusions({ isFromAirport: true, airportCode: "LDY" });
  assert.ok(pick.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(pick.bullets.some((b) => /City of Derry Airport pickup/.test(b)));
});

console.log("\nAll airport fixed-cost checks passed.");
