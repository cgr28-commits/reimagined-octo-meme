/**
 * Quote UI must apply the £5 booking saving immediately when booking value ≥ £40,
 * with no email / customer-history eligibility lookup.
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

assert.match(card, /applyBookingSavingOffer/);
assert.match(card, /claimFirstBookingOffer: applyBookingSavingOffer/);
assert.doesNotMatch(card, /checkFirstBookingOfferEligibility/);
assert.doesNotMatch(card, /firstBookingRedeemStatus/);
assert.doesNotMatch(card, /normalizeFirstBookingEmail/);
assert.doesNotMatch(card, /FirstBookingOfferAdvert/);
assert.doesNotMatch(card, /advertiseFirstBookingOffer/);
assert.doesNotMatch(card, /claimFirstBookingForCheckout/);

assert.doesNotMatch(trust, /FirstBookingOfferAdvert/);
assert.doesNotMatch(trust, /New customer/);
assert.doesNotMatch(trust, /first booking/i);
assert.match(trust, /£5 Booking Saving/);
assert.match(trust, /claimFirstBookingOffer: input\.claimFirstBookingOffer === true/);
assert.doesNotMatch(trust, /alreadyRedeemedFirstBookingOffer/);

assert.match(strip, /BOOKINGS £\$\{minValue\}\+/);
assert.match(strip, /Save £\{amount\} when your booking value is £\{minValue\} or more/);
assert.doesNotMatch(strip, /first booking/i);
assert.doesNotMatch(strip, /New customer/i);

assert.doesNotMatch(offer, /alreadyRedeemed/);
assert.doesNotMatch(offer, /normalizeFirstBookingEmail/);
assert.match(offer, /£5 BOOKING SAVING/);
assert.match(breakdown, /No email \/ customer-history \/ redemption gate/);
assert.doesNotMatch(breakdown, /alreadyRedeemed/);

assert.doesNotMatch(index, /first-booking-eligibility/);
assert.doesNotMatch(index, /hasRedeemedFirstBookingOffer/);
assert.doesNotMatch(index, /markFirstBookingOfferRedeemed/);
assert.doesNotMatch(finalize, /markFirstBookingOfferRedeemed/);
assert.doesNotMatch(finalize, /first-booking-offer-store/);

assert.throws(
  () => read("src/lib/first-booking-eligibility-api.ts"),
  /ENOENT/,
);
assert.throws(
  () => read("workers/addresses/src/first-booking-eligibility-handlers.ts"),
  /ENOENT/,
);
assert.throws(
  () => read("workers/addresses/src/first-booking-offer-store.ts"),
  /ENOENT/,
);

console.log("\nAll £5 booking-saving quote-display checks passed.");
