/**
 * PR #435 follow-up: pence-safe totals + formatQuote + fare invariants.
 * Run: npx tsx scripts/check-pr435-price-consistency.ts
 */
import assert from "node:assert/strict";
import {
  calculateAirportToAirportQuote,
  calculateQuote,
  formatQuote,
  roundGbp,
} from "../src/lib/quote";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import {
  calculateUniversalSaloonJourneyFareGbp,
  calculateUniversalEstateJourneyFareGbp,
} from "../shared/universal-distance-pricing";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import {
  checkoutAmountsMatch,
  resolveSumUpChargeAmountGbp,
} from "../shared/open-website-payment-fares";

const S = SALOON_VEHICLE;
const E = ESTATE_VEHICLE;
const miles = (m: number, durationMinutes = 40) => ({
  distanceKm: m / 0.621371,
  durationMinutes,
});

const ldy = SERVED_AIRPORTS.find((a) => a.code === "LDY")!;
const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;

function assertAmountParts(
  q: { amount: number; journeyFareGbp?: number; airportFixedCostsGbp?: number },
  label: string,
) {
  const journey = roundGbp(q.journeyFareGbp ?? 0);
  const fixed = roundGbp(q.airportFixedCostsGbp ?? 0);
  assert.equal(roundGbp(q.amount), roundGbp(journey + fixed), label);
}

console.log("=== formatQuote ===");
{
  assert.equal(formatQuote(241), "£241");
  assert.equal(formatQuote(179.5), "£179.50");
  assert.equal(formatQuote(179.4999999), "£179.50");
  assert.equal(formatQuote(30), "£30");
  assert.equal(formatQuote(2.5), "£2.50");
  console.log("OK  whole pounds and pence display");
}

console.log("\n=== LDY pickup £2.50 fixed (not rounded away) ===");
{
  const q = calculateQuote(
    "Belfast City Hall BT1",
    "LDY",
    S,
    false,
    {},
    miles(75),
    true,
  )!;
  assert.equal(q.airportFixedCostsGbp, 2.5);
  assert.equal(q.journeyFareGbp, calculateUniversalSaloonJourneyFareGbp(75)); // £178
  assert.equal(q.journeyFareGbp, 178);
  assert.equal(q.amount, roundGbp(178 + 2.5)); // £180.50 — not Math.round → £181
  assertAmountParts(q, "LDY pickup parts");
  assert.equal(formatQuote(q.amount), "£180.50");
  console.log(
    `OK  LDY pickup journey £${q.journeyFareGbp} + £2.50 = £${q.amount} (${formatQuote(q.amount)})`,
  );
}

console.log("\n=== LDY return: fixed both directions, journey discounted ===");
{
  const oneWay = calculateQuote("Belfast BT1", "LDY", S, false, {}, miles(75), true)!;
  const ret = calculateQuote(
    "Belfast BT1",
    "LDY",
    S,
    true,
    { outboundDate: "2026-09-01", outboundTime: "10:00", returnDate: "2026-09-02", returnTime: "18:00", returnJourney: true },
    miles(75),
    true,
  )!;
  const expectedJourney = roundGbp(getReturnJourneyFare(oneWay.journeyFareGbp!));
  // Pickup outbound £2.50 + drop-off return £1 = £3.50
  assert.equal(ret.airportFixedCostsGbp, 3.5);
  assert.equal(ret.journeyFareGbp, expectedJourney);
  assert.equal(ret.amount, roundGbp(expectedJourney + 3.5));
  assertAmountParts(ret, "LDY return parts");
  console.log(
    `OK  LDY return journey £${ret.journeyFareGbp} + fixed £${ret.airportFixedCostsGbp} = £${ret.amount}`,
  );
}

console.log("\n=== Dublin return: 5% discount produces pence ===");
{
  const oneWay = calculateQuote("Belfast BT1", "DUB", S, false, {}, miles(98), false)!;
  assert.equal(oneWay.journeyFareGbp, 230);
  assert.equal(oneWay.airportFixedCostsGbp, 4);
  assert.equal(oneWay.amount, 234);

  const ret = calculateQuote(
    "Belfast BT1",
    "DUB",
    S,
    true,
    {
      outboundDate: "2026-09-01",
      outboundTime: "10:00",
      returnDate: "2026-09-03",
      returnTime: "16:00",
      returnJourney: true,
    },
    miles(98),
    false,
  )!;
  // Drop-off out + pickup return = £4 + £9 = £13
  const expectedJourney = roundGbp(getReturnJourneyFare(230)); // 437
  assert.equal(expectedJourney, 437);
  assert.equal(ret.journeyFareGbp, 437);
  assert.equal(ret.airportFixedCostsGbp, 13);
  assert.equal(ret.amount, 450);
  assertAmountParts(ret, "DUB return");
  console.log(`OK  DUB return journey £437 + £13 fixed = £450`);
}

console.log("\n=== A2A with pence (BFS↔BHD destination surcharge) ===");
{
  const a2a = calculateAirportToAirportQuote(
    "BFS",
    "BHD",
    bfs.formattedAddress,
    bhd.formattedAddress,
    S,
    false,
    {},
    miles(17),
  )!;
  assert.equal(a2a.journeyFareGbp, calculateUniversalSaloonJourneyFareGbp(17));
  assert.equal(a2a.airportFixedCostsGbp, 4);
  assert.equal(a2a.amount, roundGbp(a2a.journeyFareGbp! + 4));
  assertAmountParts(a2a, "A2A");
  console.log(`OK  A2A amount £${a2a.amount}`);
}

console.log("\n=== Saloon vs Estate exactly £6 before fixed costs ===");
{
  for (const m of [4, 15, 32, 50, 98]) {
    const saloon = calculateQuote("Addr", "BHD", S, false, {}, miles(m), false)!;
    const estate = calculateQuote("Addr", "BHD", E, false, {}, miles(m), false)!;
    assert.equal(estate.journeyFareGbp! - saloon.journeyFareGbp!, 6);
    assert.equal(
      estate.journeyFareGbp,
      calculateUniversalEstateJourneyFareGbp(saloon.journeyFareGbp!),
    );
  }
  console.log("OK  Estate = Saloon + £6");
}

console.log("\n=== Quote / breakdown / SumUp charge agree to the penny ===");
{
  const q = calculateQuote("Belfast BT1", "LDY", S, false, {}, miles(75), true)!;
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: q.journeyFareGbp!,
    airportFixedCostsGbp: q.airportFixedCostsGbp!,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: false,
  });
  assert.equal(breakdown.finalAmountPayableGbp, q.amount);
  const charge = resolveSumUpChargeAmountGbp(q.amount, q.amount);
  assert.equal(charge, q.amount);
  assert.equal(checkoutAmountsMatch(q.amount, q.amount), true);
  // Mock SumUp payload amount (GBP) — no live API call
  const mockSumUpCheckout = {
    amount: charge!,
    currency: "GBP",
    description: `My Airport Taxi NI ${formatQuote(q.amount)}`,
  };
  assert.equal(mockSumUpCheckout.amount, q.amount);
  assert.equal(mockSumUpCheckout.amount, 180.5);
  console.log(`OK  mocked SumUp amount = ${mockSumUpCheckout.amount} GBP (${formatQuote(q.amount)})`);
}

console.log("\n=== Fare mismatch >2p rejects ===");
{
  assert.equal(checkoutAmountsMatch(100, 100.02), true);
  assert.equal(checkoutAmountsMatch(100, 100.03), false);
  assert.equal(resolveSumUpChargeAmountGbp(100, 100.03), null);
  console.log("OK  2p tolerance preserved");
}

console.log("\n=== Airport fixed cost rules unchanged ===");
{
  const addr = "Belfast City Hall BT1";
  assert.equal(
    calculateQuote(addr, "BFS", S, false, {}, miles(10), false)!.airportFixedCostsGbp,
    0,
  );
  assert.equal(
    calculateQuote(addr, "BHD", S, false, {}, miles(10), false)!.airportFixedCostsGbp,
    0,
  );
  assert.equal(
    calculateQuote(addr, "DUB", S, false, {}, miles(98), false)!.airportFixedCostsGbp,
    4,
  );
  assert.equal(
    calculateQuote(addr, "DUB", S, false, {}, miles(98), true)!.airportFixedCostsGbp,
    9,
  );
  assert.equal(
    calculateQuote(addr, "LDY", S, false, {}, miles(40), false)!.airportFixedCostsGbp,
    1,
  );
  assert.equal(
    calculateQuote(addr, "LDY", S, false, {}, miles(40), true)!.airportFixedCostsGbp,
    2.5,
  );
  console.log("OK  BFS/BHD/DUB/LDY fixed costs");
}

void ldy;
console.log("\nAll PR #435 price-consistency checks passed.");
