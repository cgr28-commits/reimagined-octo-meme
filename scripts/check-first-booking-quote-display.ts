/**
 * Quote UI must apply the £5 booking saving from live Express selection,
 * show final payable (not journey-after-promo alone), and never gate payment
 * on customer-history / first-booking eligibility.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const card = read("src/components/QuoteCard.tsx");
const trust = read("src/components/QuoteFareTrust.tsx");
const strip = read("src/components/FirstBookingOfferStrip.tsx");
const offer = read("shared/first-booking-offer.ts");
const breakdown = read("shared/website-fare-breakdown.ts");
const index = read("workers/addresses/src/index.ts");
const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");

/** Test H — payment button does not depend on customer-history checks */
assert.doesNotMatch(card, /checkFirstBookingOfferEligibility/);
assert.doesNotMatch(card, /firstBookingRedeemStatus/);
assert.doesNotMatch(card, /normalizeFirstBookingEmail/);
assert.doesNotMatch(card, /claimFirstBookingForCheckout/);
assert.doesNotMatch(card, /advertiseFirstBookingOffer/);
assert.doesNotMatch(card, /FirstBookingOfferAdvert/);

/** Live Express fee drives the authoritative composer */
assert.match(card, /airportAccessChargeGbp: expressSelection\.feeGbp/);
assert.match(card, /claimFirstBookingOffer: true/);
assert.match(card, /expressSelection\.feeGbp/);
assert.match(
  card,
  /disabled=\{\s*paymentLoading \|\|[\s\S]*?termsAccepted[\s\S]*?customerName[\s\S]*?customerEmail[\s\S]*?customerMobile[\s\S]*?tripDetailsReady/,
);

/** Dominant / payable totals must use finalAmountPayableGbp, not journey-after-promo alone */
assert.match(card, /totalGbp: openWebsiteFareBreakdown\.finalAmountPayableGbp/);
assert.match(trust, /bookingValueBeforeFirstBookingOfferGbp/);
assert.match(trust, /finalAmountPayableGbp/);
assert.match(trust, /Original booking value/);
assert.doesNotMatch(
  trust,
  /line-through[\s\S]{0,120}originalEligibleJourneyPriceGbp[\s\S]{0,80}journeyFareAfterPromotionsGbp/,
);
assert.match(trust, /formatGbpFare\(prePromoBookingValueGbp\)/);
assert.match(trust, /formatGbpFare\(finalPayableGbp\)/);
assert.match(trust, /£5 Booking Saving|firstBookingShortLabel/);
assert.doesNotMatch(trust, /New customer|first booking/i);

assert.match(strip, /BOOKINGS £\$\{minValue\}\+/);
assert.doesNotMatch(strip, /YOUR FIRST BOOKING|New customer|first booking/i);

assert.doesNotMatch(offer, /alreadyRedeemed/);
assert.doesNotMatch(offer, /normalizeFirstBookingEmail/);
assert.match(breakdown, /prePromotionBookingValue|bookingValueBeforeFirstBookingOfferGbp/);
assert.doesNotMatch(breakdown, /alreadyRedeemed/);

assert.doesNotMatch(index, /first-booking-eligibility/);
assert.doesNotMatch(index, /hasRedeemedFirstBookingOffer/);
assert.doesNotMatch(index, /markFirstBookingOfferRedeemed/);
assert.doesNotMatch(finalize, /markFirstBookingOfferRedeemed/);
assert.doesNotMatch(finalize, /first-booking-offer-store/);

assert.throws(() => read("src/lib/first-booking-eligibility-api.ts"), /ENOENT/);
assert.throws(
  () => read("workers/addresses/src/first-booking-eligibility-handlers.ts"),
  /ENOENT/,
);
assert.throws(() => read("workers/addresses/src/first-booking-offer-store.ts"), /ENOENT/);

console.log("\nAll £5 booking-saving quote-display checks passed.");
