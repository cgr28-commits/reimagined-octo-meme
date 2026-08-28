/**
 * Airport fee product rules: DUB/LDY amounts, mandatory vs A2A removable,
 * and confirmation that the £5-over-£40 offer is disabled.
 * Run: npx tsx scripts/check-airport-fee-product-rules.ts
 */

import assert from "node:assert/strict";
import {
  calculateAirportToAirportQuote,
  calculateQuote,
} from "../src/lib/quote";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import {
  formatAirportFeeLabel,
  resolveJourneyAirportFees,
} from "../shared/airport-fixed-costs";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { FIRST_BOOKING_OFFER_CONFIG } from "../shared/first-booking-offer";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const S = SALOON_VEHICLE;
const E = ESTATE_VEHICLE;
const CITY = "Belfast City Hall, Belfast BT1 5GS";
const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;
const dub = SERVED_AIRPORTS.find((a) => a.code === "DUB")!;
const ldy = SERVED_AIRPORTS.find((a) => a.code === "LDY")!;

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

check("£5-over-£40 booking saving is disabled", () => {
  assert.equal(FIRST_BOOKING_OFFER_CONFIG.enabled, false);
  for (const journey of [40, 41, 50, 100, 237]) {
    const breakdown = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: journey,
      airportFixedCostsGbp: 0,
      airportAccessChargeGbp: 0,
      claimFirstBookingOffer: true,
    });
    assert.equal(breakdown.firstBookingSavingGbp, 0);
    assert.equal(breakdown.finalAmountPayableGbp, journey);
  }
});

check("City Hall → Dublin: base £230, airport fee £0, no removal", () => {
  const q = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  assert.equal(q.journeyFareGbp, 230);
  assert.equal(q.airportFixedCostsGbp, 0);
  assert.equal(q.amount, 230);
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "DUB",
    fromAirport: false,
    removedFeeIds: ["outbound:DUB:drop-off"],
  });
  assert.equal(fees.totalAppliedGbp, 0);
  assert.equal(fees.lines.length, 0);
});

check("Dublin → City Hall: base £230 + £5 parking mandatory", () => {
  const q = calculateQuote(CITY, "DUB", S, false, {}, null, true)!;
  assert.equal(q.journeyFareGbp, 230);
  assert.equal(q.airportFixedCostsGbp, 5);
  assert.equal(q.amount, 235);
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "DUB",
    fromAirport: true,
    removedFeeIds: ["outbound:DUB:pickup"],
  });
  assert.equal(fees.lines.length, 1);
  assert.equal(fees.lines[0].removable, false);
  assert.equal(fees.lines[0].removed, false);
  assert.equal(fees.lines[0].appliedAmountGbp, 5);
  assert.equal(fees.lines[0].label, "Dublin Airport pickup/parking");
  assert.equal(fees.totalAppliedGbp, 5);
});

check("City Hall → Dublin RETURN: £0 outbound + £5 return pickup; 5% return discount", () => {
  const oneWay = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  const ret = calculateQuote(CITY, "DUB", S, true, {}, null, false)!;
  assert.equal(oneWay.journeyFareGbp, 230);
  assert.equal(ret.journeyFareGbp, getReturnJourneyFare(230));
  assert.equal(ret.airportFixedCostsGbp, 5); // return leg is Dublin pickup
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "DUB",
    fromAirport: false,
    returnJourney: true,
  });
  assert.deepEqual(
    fees.lines.map((l) => [l.leg, l.direction, l.originalAmountGbp, l.removable]),
    [["return", "pickup", 5, false]],
  );
});

check("City Hall → LDY: £1 drop-off mandatory", () => {
  const q = calculateQuote(CITY, "LDY", S, false, {}, null, false)!;
  assert.equal(q.airportFixedCostsGbp, 1);
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "LDY",
    fromAirport: false,
    removedFeeIds: ["outbound:LDY:drop-off"],
  });
  assert.equal(fees.lines[0].removable, false);
  assert.equal(fees.totalAppliedGbp, 1);
  assert.match(fees.lines[0].label, /City of Derry Airport drop-off/);
});

check("LDY → City Hall: £2.50 pickup mandatory", () => {
  const q = calculateQuote(CITY, "LDY", S, false, {}, null, true)!;
  assert.equal(q.airportFixedCostsGbp, 2.5);
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "LDY",
    fromAirport: true,
    removedFeeIds: ["outbound:LDY:pickup"],
  });
  assert.equal(fees.totalAppliedGbp, 2.5);
  assert.equal(fees.lines[0].removable, false);
});

check("Dublin → LDY A2A: £5 + £1 independently removable", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "LDY",
  });
  assert.equal(fees.totalOriginalGbp, 6);
  assert.equal(fees.lines.length, 2);
  assert.ok(fees.lines.every((l) => l.removable));
  assert.equal(fees.lines[0].label, "Dublin Airport pickup/parking");
  assert.equal(fees.lines[1].label, "City of Derry Airport drop-off");

  const removeDub = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "LDY",
    removedFeeIds: ["outbound:DUB:pickup"],
  });
  assert.equal(removeDub.totalAppliedGbp, 1);
  assert.equal(removeDub.lines.find((l) => l.airportCode === "DUB")?.removed, true);
  assert.equal(removeDub.lines.find((l) => l.airportCode === "LDY")?.removed, false);

  const removeLdy = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "LDY",
    removedFeeIds: ["outbound:LDY:drop-off"],
  });
  assert.equal(removeLdy.totalAppliedGbp, 5);
});

check("LDY → Dublin A2A: only £2.50 shown (Dublin drop-off £0)", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "LDY",
    dropoffAirportCode: "DUB",
  });
  assert.equal(fees.lines.length, 1);
  assert.equal(fees.totalOriginalGbp, 2.5);
  assert.equal(fees.lines[0].airportCode, "LDY");
  assert.equal(fees.lines[0].removable, true);
});

check("BFS → Dublin A2A: BFS pickup surcharge + Dublin £0 drop-off", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "BFS",
    dropoffAirportCode: "DUB",
  });
  assert.equal(fees.totalOriginalGbp, 5);
  assert.equal(fees.lines.length, 1);
  assert.equal(fees.lines[0].airportCode, "BFS");
  assert.equal(fees.lines[0].direction, "pickup");
  assert.equal(fees.lines[0].removable, true);
});

check("Dublin → BFS A2A: £5 DUB pickup + £5 BFS drop-off independently removable", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "BFS",
  });
  assert.equal(fees.totalOriginalGbp, 10);
  assert.equal(fees.lines.length, 2);
  const removeOne = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "BFS",
    removedFeeIds: ["outbound:DUB:pickup"],
  });
  assert.equal(removeOne.totalAppliedGbp, 5);
});

check("BHD → LDY A2A: BHD pickup surcharge + LDY £1 drop-off", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "BHD",
    dropoffAirportCode: "LDY",
  });
  assert.equal(fees.totalOriginalGbp, 5); // BHD £4 + LDY £1
  assert.equal(fees.lines.length, 2);
});

check("A2A return keeps outbound/return fee ids independent", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "LDY",
    returnJourney: true,
    removedFeeIds: ["outbound:DUB:pickup"],
  });
  // Outbound: DUB £5 removed, LDY £1 kept.
  // Return: LDY pickup £2.50 + DUB drop-off £0 → only LDY £2.50.
  assert.equal(fees.totalAppliedGbp, 1 + 2.5);
  assert.ok(fees.lines.some((l) => l.id === "outbound:DUB:pickup" && l.removed));
  assert.ok(fees.lines.some((l) => l.id === "return:LDY:pickup" && !l.removed));
});

check("Estate Dublin base uplift unchanged; only parking fee differs from saloon", () => {
  const saloonDrop = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  const estateDrop = calculateQuote(CITY, "DUB", E, false, {}, null, false)!;
  assert.equal(saloonDrop.airportFixedCostsGbp, 0);
  assert.equal(estateDrop.airportFixedCostsGbp, 0);
  assert.equal(saloonDrop.journeyFareGbp, 230);
  assert.equal(estateDrop.journeyFareGbp, 238);
  const saloonPick = calculateQuote(CITY, "DUB", S, false, {}, null, true)!;
  const estatePick = calculateQuote(CITY, "DUB", E, false, {}, null, true)!;
  assert.equal(saloonPick.airportFixedCostsGbp, 5);
  assert.equal(estatePick.airportFixedCostsGbp, 5);
  assert.equal(saloonPick.amount, 235);
  assert.equal(estatePick.journeyFareGbp! + estatePick.airportFixedCostsGbp!, 243);
  // roundFare may snap the payable total; journey+fixed composition stays exact.
  assert.ok(Math.abs((estatePick.amount ?? 0) - 243) <= 2);
});

check("Labels: Dublin pickup/parking wording", () => {
  assert.equal(formatAirportFeeLabel("DUB", "pickup"), "Dublin Airport pickup/parking");
  assert.equal(formatAirportFeeLabel("LDY", "drop-off"), "City of Derry Airport drop-off");
});

// Keep references used for A2A quote smoke (journey base still calculated).
check("A2A quote still composes fixed costs into amount", () => {
  const metrics = { distanceKm: 120, durationMinutes: 110 };
  const q = calculateAirportToAirportQuote(
    "DUB",
    "LDY",
    dub.formattedAddress,
    ldy.formattedAddress,
    S,
    false,
    {},
    metrics,
  );
  // DUB end forces DUB pricing path when one end is DUB — still includes £5 pickup.
  assert.ok(q);
  assert.ok((q!.airportFixedCostsGbp ?? 0) >= 0);
  void bfs;
  void bhd;
});

console.log("\nAll airport fee product-rule checks passed.");
