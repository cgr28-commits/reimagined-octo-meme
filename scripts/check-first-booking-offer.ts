/**
 * Authoritative £5 booking saving + website fare breakdown checks.
 * £40 minimum uses booking value (journey + fixed + Express). Express never enters promo savings.
 * No email / customer-history / redemption gate.
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

check("£39 booking → no £5 discount", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 39,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 39);
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 39);
  assert.equal(breakdown.firstBooking.reason, "below_minimum");
});

check("£40 booking → £5 discount → final £35", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 40);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
});

check("£45 booking → £5 discount → final £40", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 45);
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 40);
});

check("Example: £35 journey + £5 Express = £40 → qualifies → final £35", () => {
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

check("Example: £35 journey + free drop-off = £35 → does not qualify", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 35,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.bookingValueBeforeFirstBookingOfferGbp, 35);
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 35);
});

check("Express on/off recalculates eligibility immediately (£35 journey)", () => {
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

check("Express on/off for £40 journey keeps promo when removing Express", () => {
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
  assert.equal(withExpress.finalAmountPayableGbp, 40);
  assert.equal(freeArea.finalAmountPayableGbp, 35);
  assert.equal(withExpress.firstBookingSavingGbp, 5);
  assert.equal(freeArea.firstBookingSavingGbp, 5);
});

check("no email/redemption fields — offer applies without customer history", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 50,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: true,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 50);
  assert.equal(
    Object.prototype.hasOwnProperty.call(breakdown, "alreadyRedeemedFirstBookingOffer"),
    false,
  );
});

check("return 5% saving still works alone", () => {
  const journeyAfterReturn = 85.5;
  const returnSaving = getReturnJourneySavingGbp(journeyAfterReturn);
  assert.equal(returnSaving, 4.5);

  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: journeyAfterReturn,
    airportAccessChargeGbp: 0,
    returnJourney: true,
    claimFirstBookingOffer: false,
  });
  assert.equal(breakdown.returnJourneySavingGbp, 4.5);
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.totalPromotionalSavingGbp, 4.5);
});

check("stacked return + £5 promotion totals correctly", () => {
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

check("personal/quick path can withhold offer via claimFirstBookingOffer false", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 5,
    claimFirstBookingOffer: false,
  });
  assert.equal(breakdown.firstBookingSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 45);
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

check("resolver has no alreadyRedeemed input", () => {
  const offer = resolveFirstBookingOffer({
    journeyFareBeforeAirportAccessGbp: 40,
    airportAccessChargeGbp: 0,
    claimOffer: true,
  });
  assert.equal(offer.applied, true);
  assert.equal(offer.discountGbp, 5);
  assert.doesNotMatch(
    String(resolveFirstBookingOffer),
    /alreadyRedeemed/,
  );
});

console.log("\nAll £5 booking-saving / fare-breakdown checks passed.");
