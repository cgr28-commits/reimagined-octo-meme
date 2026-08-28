/**
 * Authoritative £5 booking saving + Express fare breakdown checks.
 *
 * Formula:
 *   prePromotionBookingValue = journeyFare + selectedAirportAccessCharge (+ fixed costs)
 *   bookingSaving = prePromotionBookingValue >= 40 ? 5 : 0
 *   finalAmountPayable = prePromotionBookingValue - bookingSaving
 *
 * Express avoided ≠ promotional saving. No email / redemption gate.
 */
import assert from "node:assert/strict";
import { resolveFirstBookingOffer } from "../shared/first-booking-offer";
import {
  composeWebsiteFareBreakdown,
  getReturnJourneySavingGbp,
} from "../shared/website-fare-breakdown";

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

check("Default config: £5-over-£40 offer is disabled", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 50,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 55);
  assert.equal(breakdown.firstBooking.reason, "disabled");
});

/** Test A */
check("A: Journey £40 + Express £5 → pre £45, saving £5, final £40", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 45);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.airportAccessChargeGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 40);
  assert.equal(breakdown.totalPromotionalSavingGbp, 5);
});

/** Test B */
check("B: Journey £40 + Express £0 → pre £40, saving £5, final £35", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 40);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.airportAccessChargeGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
  assert.equal(breakdown.totalPromotionalSavingGbp, 5);
});

/** Test C */
check("C: Journey £35 + Express £5 → pre £40, saving £5, final £35", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 40);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
});

/** Test D */
check("D: Journey £35 + Express £0 → pre £35, saving £0, final £35", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 35);
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
  assert.equal(breakdown.firstBooking.reason, "below_minimum");
});

/** Test E */
check("E: Toggle Express → Free on £40 journey: final £40 → £35", () => {
  const withExpress = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  const freeArea = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(withExpress.finalAmountPayableGbp, 40);
  assert.equal(freeArea.finalAmountPayableGbp, 35);
});

/** Test F */
check("F: Toggle Free → Express on £40 journey: final £35 → £40", () => {
  const freeArea = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  const withExpress = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(freeArea.finalAmountPayableGbp, 35);
  assert.equal(withExpress.finalAmountPayableGbp, 40);
});

/** Test G — Step 2 / Step 3 / SumUp share one composer result */
check("G: Step 2, Step 3 and SumUp amounts match in both Express states", () => {
  for (const access of [5, 0]) {
    const step2 = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 40,
      airportAccessChargeGbp: access,
      claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
    });
    const step3 = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 40,
      airportAccessChargeGbp: access,
      claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
    });
    const sumUp = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 40,
      airportAccessChargeGbp: access,
      claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
    });
    assert.equal(step2.finalAmountPayableGbp, step3.finalAmountPayableGbp);
    assert.equal(step3.finalAmountPayableGbp, sumUp.finalAmountPayableGbp);
    assert.equal(sumUp.finalAmountPayableGbp, access === 5 ? 40 : 35);
  }
});

check("£39 booking → no £5 discount", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 39,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 39);
});

check("£45 booking (journey £40 + Express £5) → £5 discount → final £40", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.finalAmountPayableGbp, 40);
});

check("avoided Express is not a promotional saving", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.totalPromotionalSavingGbp, 5);
  assert.equal(breakdown.airportAccessChargeGbp, 0);
});

check("return 5% saving still works alone", () => {
  const journeyAfterReturn = 85.5;
  assert.equal(getReturnJourneySavingGbp(journeyAfterReturn), 4.5);
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: journeyAfterReturn,
    airportAccessChargeGbp: 0,
    returnJourney: true,
    claimFirstBookingOffer: false,
  });
  assert.equal(breakdown.returnJourneySavingGbp, 4.5);
  assert.equal(breakdown.firstBookingSavingGbp, 0);
});

check("stacked return + £5 promotion totals correctly", () => {
  const journeyAfterReturn = 85.5;
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: journeyAfterReturn,
    airportAccessChargeGbp: 5,
    returnJourney: true,
    claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
  });
  assert.equal(breakdown.returnJourneySavingGbp, 4.5);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.totalPromotionalSavingGbp, 9.5);
  assert.equal(breakdown.finalAmountPayableGbp, 85.5);
});

check("final equals pre-promo booking value minus booking saving", () => {
  const cases = [
    { journey: 40, access: 5, expected: 40 },
    { journey: 40, access: 0, expected: 35 },
    { journey: 35, access: 5, expected: 35 },
    { journey: 35, access: 0, expected: 35 },
  ];
  for (const c of cases) {
    const b = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: c.journey,
      airportAccessChargeGbp: c.access,
      claimFirstBookingOffer: true,
    firstBookingConfig: { enabled: true },
    });
    const expectedSaving = b.bookingValueBeforeFirstBookingOfferGbp >= 40 ? 5 : 0;
    assert.equal(
      b.finalAmountPayableGbp,
      Math.round((b.bookingValueBeforeFirstBookingOfferGbp - expectedSaving) * 100) / 100,
    );
    assert.equal(b.finalAmountPayableGbp, c.expected);
  }
});

check("no alreadyRedeemed / email redemption in resolver", () => {
  const offer = resolveFirstBookingOffer({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimOffer: true,
    config: { enabled: true },
  });
  assert.equal(offer.applied, true);
  assert.doesNotMatch(String(resolveFirstBookingOffer), /alreadyRedeemed/);
});

console.log("\nAll £5 booking-saving / Express fare-breakdown checks passed.");
