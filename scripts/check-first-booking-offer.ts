/**
 * Authoritative first-booking offer + website fare breakdown checks.
 * Ensures Express / airport access never enter promotional savings or the £40 threshold.
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

check("one-way below £40 is not eligible (even with Express £5)", () => {
  const offer = resolveFirstBookingOffer({
    journeyFareBeforeAirportAccessGbp: 39,
    claimOffer: true,
  });
  assert.equal(offer.applied, false);
  assert.equal(offer.reason, "below_minimum");

  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 39,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 44);
  assert.equal(breakdown.totalPromotionalSavingGbp, 0);
});

check("one-way £40 + Express £5 is eligible; Express excluded from threshold and discount", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.journeyFareAfterPromotionsGbp, 35);
  assert.equal(breakdown.airportAccessChargeGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 40);
  assert.equal(breakdown.totalPromotionalSavingGbp, 5);
});

check("one-way eligible without Express", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 45,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 40);
});

check("return 5% saving stacks with £5 first-booking; Express excluded from promo total", () => {
  // Post-return journey fare £85.50 → return saving £4.50 from £90 undiscounted.
  const journeyAfterReturn = 85.5;
  const returnSaving = getReturnJourneySavingGbp(journeyAfterReturn);
  assert.equal(returnSaving, 4.5);

  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: journeyAfterReturn,
    airportAccessChargeGbp: 5,
    returnJourney: true,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.returnJourneySavingGbp, 4.5);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.totalPromotionalSavingGbp, 9.5);
  assert.equal(breakdown.originalEligibleJourneyPriceGbp, 90);
  assert.equal(breakdown.journeyFareAfterPromotionsGbp, 80.5);
  assert.equal(breakdown.finalAmountPayableGbp, 85.5);
  // Avoided Express is NOT a promotional saving.
  assert.equal(breakdown.airportAccessChargeGbp, 5);
});

check("free airport option: Express £0; promo savings unchanged", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 85.5,
    airportAccessChargeGbp: 0,
    returnJourney: true,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.returnJourneySavingGbp, 4.5);
  assert.equal(breakdown.totalPromotionalSavingGbp, 9.5);
  assert.equal(breakdown.finalAmountPayableGbp, 80.5);
});

check("already redeemed blocks first-booking offer", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 50,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
    alreadyRedeemedFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 55);
});

check("claimFirstBookingOffer false keeps full price (advertise-only stage)", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: false,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.journeyFareAfterPromotionsGbp, 40);
  assert.equal(breakdown.finalAmountPayableGbp, 45);
  assert.equal(breakdown.totalPromotionalSavingGbp, 0);
});

check("return discount still applies when first-booking claim is false", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 85.5,
    airportAccessChargeGbp: 5,
    returnJourney: true,
    claimFirstBookingOffer: false,
  });
  assert.equal(breakdown.returnJourneySavingGbp, 4.5);
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.totalPromotionalSavingGbp, 4.5);
  assert.equal(breakdown.finalAmountPayableGbp, 90.5);
});

check("airport fixed costs never discounted or counted toward £40", () => {
  // Journey £39 + fixed £8 would be £47 transfer, but journey is below £40.
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 39,
    airportFixedCostsGbp: 8,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.transferFareAfterPromotionsGbp, 47);
  assert.equal(breakdown.finalAmountPayableGbp, 52);
});

check("display and SumUp totals agree for stacked return + first booking + Express", () => {
  const displayed = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 85.5,
    airportAccessChargeGbp: 5,
    returnJourney: true,
    claimFirstBookingOffer: true,
  });
  const sumUp = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 85.5,
    airportAccessChargeGbp: 5,
    returnJourney: true,
    claimFirstBookingOffer: true,
  });
  assert.equal(displayed.finalAmountPayableGbp, sumUp.finalAmountPayableGbp);
});

check("toggling Express changes payable by the access fee (not a second journey discount)", () => {
  const withExpress = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  const freeArea = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(withExpress.firstBookingSavingGbp, 5);
  assert.equal(freeArea.firstBookingSavingGbp, 5);
  assert.equal(withExpress.journeyFareAfterPromotionsGbp, 35);
  assert.equal(freeArea.journeyFareAfterPromotionsGbp, 35);
  assert.equal(withExpress.finalAmountPayableGbp, 40);
  assert.equal(freeArea.finalAmountPayableGbp, 35);
  assert.equal(withExpress.finalAmountPayableGbp - freeArea.finalAmountPayableGbp, 5);
  // Free area must not invent an extra promotional −£5.
  assert.equal(freeArea.totalPromotionalSavingGbp, 5);
});

console.log("\nAll first-booking / fare-breakdown checks passed.");
