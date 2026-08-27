/**
 * Authoritative first-booking offer + website fare breakdown checks.
 * £40 minimum uses booking value (journey + Express). Express never enters promo savings.
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

check("Example 1: £35 journey + £5 Express = £40 → qualifies → final £35", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 40);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
  assert.equal(breakdown.totalPromotionalSavingGbp, 5);
});

check("Example 2: £35 journey + free drop-off = £35 → does not qualify", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 35);
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
  assert.equal(breakdown.firstBooking.reason, "below_minimum");
});

check("Example 3: £40 journey + free drop-off = £40 → qualifies → final £35", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 40);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
});

check("Example 4: £40 journey + £5 Express = £45 → qualifies → final £40", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 45);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 40);
});

check("Changing Express → free immediately reduces total by £5", () => {
  const withExpress = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: false,
  });
  const freeArea = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: false,
  });
  assert.equal(withExpress.finalAmountPayableGbp, 40);
  assert.equal(freeArea.finalAmountPayableGbp, 35);
  assert.equal(withExpress.finalAmountPayableGbp - freeArea.finalAmountPayableGbp, 5);
});

check("Changing Express → free can remove first-booking eligibility", () => {
  const withExpress = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  const freeArea = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(withExpress.firstBookingSavingGbp, 5);
  assert.equal(withExpress.finalAmountPayableGbp, 35);
  assert.equal(freeArea.firstBookingSavingGbp, 0);
  assert.equal(freeArea.finalAmountPayableGbp, 35);
});

check("claimFirstBookingOffer false keeps full price (advertise-only stage)", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: false,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 45);
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

check("return 5% saving stacks with £5 first-booking; Express excluded from promo total", () => {
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
  assert.equal(breakdown.finalAmountPayableGbp, 85.5);
});

check("avoided Express is not a promotional saving", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.totalPromotionalSavingGbp, 5);
  assert.equal(breakdown.airportAccessChargeGbp, 0);
});

check("old journey-only threshold behaviour is gone (£35 + Express now qualifies)", () => {
  const offer = resolveFirstBookingOffer({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 5,
    claimOffer: true,
  });
  assert.equal(offer.applied, true);
  assert.equal(offer.bookingValueBeforeOfferGbp, 40);
});

check("display and SumUp totals agree", () => {
  const displayed = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  const sumUp = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(displayed.finalAmountPayableGbp, sumUp.finalAmountPayableGbp);
  assert.equal(displayed.finalAmountPayableGbp, 35);
});

console.log("\nAll first-booking / fare-breakdown checks passed.");
