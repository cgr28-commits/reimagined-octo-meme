/**
 * Airport fee product rules: DUB/LDY amounts + tolls, airport-specific
 * removability, and confirmation that the £5-over-£40 offer is disabled.
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
  AIRPORT_FIXED_COSTS_GBP,
  formatAirportFeeLabel,
  isAirportFeeCustomerChoiceAllowed,
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

check("Config: DUB parking £5 + M1 toll £4; LDY fees; choice permissions", () => {
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.parkingAllowanceGbp, 5);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.tollAllowanceGbp, 4);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.dropOffFeeGbp, 0);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.LDY.pickupFeeGbp, 2.5);
  assert.equal(AIRPORT_FIXED_COSTS_GBP.LDY.dropOffFeeGbp, 1);
  assert.equal(isAirportFeeCustomerChoiceAllowed("DUB"), false);
  assert.equal(isAirportFeeCustomerChoiceAllowed("LDY"), false);
  assert.equal(isAirportFeeCustomerChoiceAllowed("BFS"), true);
  assert.equal(isAirportFeeCustomerChoiceAllowed("BHD"), true);
});

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

check("City Hall → Dublin: base £230 + M1 £4; drop-off fee £0; no removal", () => {
  const q = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  assert.equal(q.journeyFareGbp, 230);
  assert.equal(q.airportFixedCostsGbp, 4);
  assert.equal(q.amount, 234);
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "DUB",
    fromAirport: false,
    removedFeeIds: ["outbound:DUB:toll", "outbound:DUB:drop-off"],
  });
  assert.equal(fees.totalAppliedGbp, 4);
  assert.ok(fees.lines.every((l) => !l.removable));
  assert.equal(fees.lines.length, 1);
  assert.equal(fees.lines[0].direction, "toll");
  assert.equal(fees.lines[0].label, "M1 tolls");
});

check("Dublin → City Hall: £5 parking + £4 toll mandatory", () => {
  const q = calculateQuote(CITY, "DUB", S, false, {}, null, true)!;
  assert.equal(q.journeyFareGbp, 230);
  assert.equal(q.airportFixedCostsGbp, 9);
  assert.equal(q.amount, 239);
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "DUB",
    fromAirport: true,
    removedFeeIds: ["outbound:DUB:pickup", "outbound:DUB:toll"],
  });
  assert.equal(fees.lines.length, 2);
  assert.ok(fees.lines.every((l) => !l.removable && !l.removed));
  assert.equal(fees.totalAppliedGbp, 9);
  assert.equal(
    fees.lines.find((l) => l.direction === "pickup")?.label,
    "Dublin Airport pickup/parking",
  );
  assert.equal(fees.lines.find((l) => l.direction === "toll")?.label, "M1 tolls");
});

check("City Hall → Dublin RETURN: outbound toll £4 + return parking £5 + toll £4; 5% return", () => {
  const oneWay = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  const ret = calculateQuote(CITY, "DUB", S, true, {}, null, false)!;
  assert.equal(oneWay.journeyFareGbp, 230);
  assert.equal(ret.journeyFareGbp, getReturnJourneyFare(230));
  assert.equal(ret.airportFixedCostsGbp, 4 + 9); // outbound toll + return parking+toll
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: "DUB",
    fromAirport: false,
    returnJourney: true,
    removedFeeIds: ["return:DUB:pickup"],
  });
  assert.ok(fees.lines.every((l) => !l.removable));
  assert.equal(fees.totalAppliedGbp, 13);
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

check("Dublin → LDY A2A: DUB £5+£4 and LDY £1 all mandatory", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "LDY",
    removedFeeIds: [
      "outbound:DUB:pickup",
      "outbound:DUB:toll",
      "outbound:LDY:drop-off",
    ],
  });
  assert.equal(fees.totalOriginalGbp, 5 + 4 + 1);
  assert.equal(fees.totalAppliedGbp, 10); // removals ignored
  assert.ok(fees.lines.every((l) => !l.removable && !l.removed));
});

check("LDY → Dublin A2A: LDY £2.50 + DUB toll £4; no DUB drop fee; none removable", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "LDY",
    dropoffAirportCode: "DUB",
    removedFeeIds: ["outbound:LDY:pickup", "outbound:DUB:toll"],
  });
  assert.equal(fees.totalAppliedGbp, 2.5 + 4);
  assert.ok(!fees.lines.some((l) => l.direction === "drop-off"));
  assert.ok(fees.lines.every((l) => !l.removable));
});

check("DUB → BFS A2A: DUB fees mandatory; BFS destination may be removable", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "DUB",
    dropoffAirportCode: "BFS",
    removedFeeIds: ["outbound:DUB:pickup", "outbound:BFS:drop-off"],
  });
  const dubPickup = fees.lines.find((l) => l.id === "outbound:DUB:pickup")!;
  const dubToll = fees.lines.find((l) => l.id === "outbound:DUB:toll")!;
  const bfs = fees.lines.find((l) => l.airportCode === "BFS")!;
  assert.equal(dubPickup.removable, false);
  assert.equal(dubPickup.removed, false);
  assert.equal(dubPickup.appliedAmountGbp, 5);
  assert.equal(dubToll.removable, false);
  assert.equal(dubToll.appliedAmountGbp, 4);
  assert.equal(bfs.removable, true);
  assert.equal(bfs.removed, true);
  assert.equal(bfs.appliedAmountGbp, 0);
  assert.equal(fees.totalAppliedGbp, 9);
});

check("BFS → DUB A2A: BFS may be removable; DUB drop £0 + toll mandatory", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "BFS",
    dropoffAirportCode: "DUB",
    removedFeeIds: ["outbound:BFS:pickup", "outbound:DUB:toll"],
  });
  const bfs = fees.lines.find((l) => l.airportCode === "BFS")!;
  const toll = fees.lines.find((l) => l.direction === "toll")!;
  assert.equal(bfs.removable, true);
  assert.equal(bfs.removed, true);
  assert.equal(toll.removable, false);
  assert.equal(toll.removed, false);
  assert.equal(fees.totalAppliedGbp, 4);
});

check("BHD → LDY A2A: BHD removable; LDY £1 mandatory", () => {
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: "BHD",
    dropoffAirportCode: "LDY",
    removedFeeIds: ["outbound:BHD:pickup", "outbound:LDY:drop-off"],
  });
  assert.equal(fees.lines.find((l) => l.airportCode === "BHD")?.removed, true);
  assert.equal(fees.lines.find((l) => l.airportCode === "LDY")?.removed, false);
  assert.equal(fees.totalAppliedGbp, 1);
});

check("Estate Dublin base uplift unchanged; toll + parking compose correctly", () => {
  const saloonDrop = calculateQuote(CITY, "DUB", S, false, {}, null, false)!;
  const estateDrop = calculateQuote(CITY, "DUB", E, false, {}, null, false)!;
  assert.equal(saloonDrop.journeyFareGbp, 230);
  assert.equal(estateDrop.journeyFareGbp, 238);
  assert.equal(saloonDrop.airportFixedCostsGbp, 4);
  assert.equal(estateDrop.airportFixedCostsGbp, 4);
  assert.equal(saloonDrop.amount, 234);
  const saloonPick = calculateQuote(CITY, "DUB", S, false, {}, null, true)!;
  const estatePick = calculateQuote(CITY, "DUB", E, false, {}, null, true)!;
  assert.equal(saloonPick.airportFixedCostsGbp, 9);
  assert.equal(estatePick.airportFixedCostsGbp, 9);
  assert.equal(saloonPick.amount, 239);
});

check("Labels", () => {
  assert.equal(formatAirportFeeLabel("DUB", "pickup"), "Dublin Airport pickup/parking");
  assert.equal(formatAirportFeeLabel("DUB", "toll"), "M1 tolls");
  assert.equal(formatAirportFeeLabel("LDY", "drop-off"), "City of Derry Airport drop-off");
});

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
  assert.ok(q);
  // DUB↔LDY uses the DUB directional pricing path; fixed costs still present.
  assert.ok(typeof q!.amount === "number" && q!.amount > 0);
  void bfs;
  void bhd;
});

console.log("\nAll airport fee product-rule checks passed.");
