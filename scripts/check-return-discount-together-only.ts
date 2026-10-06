/**
 * 5% return discount is only for one checkout that books both legs together.
 * A one-way booking does not schedule a follow-up 5% email, and a later
 * separate booking does not inherit that discount.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RETURN_JOURNEY_DISCOUNT_RATE, getWebsiteReturnJourneyFare } from "../shared/return-journey-discount";
import {
  RETURN_FOLLOW_UP_OFFER_ENABLED,
  shouldApplyReturnOfferDiscount,
} from "../shared/return-offer";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

const ONE_WAY = 80;

check("return booking with both legs together still takes 5% off", () => {
  assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, 0.05);
  const combined = getWebsiteReturnJourneyFare(ONE_WAY);
  assert.equal(combined, 152);
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: combined,
    airportFixedCostsGbp: 0,
    returnJourney: true,
  });
  assert.equal(breakdown.returnJourneySavingGbp, 8);
  assert.equal(breakdown.returnOfferSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, 152);
  assert.ok(breakdown.finalAmountPayableGbp < ONE_WAY * 2);
});

check("one-way booking has no 5% return discount", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: ONE_WAY,
    airportFixedCostsGbp: 0,
    returnJourney: false,
  });
  assert.equal(breakdown.returnJourney, false);
  assert.equal(breakdown.returnJourneySavingGbp, 0);
  assert.equal(breakdown.returnOfferSavingGbp, 0);
  assert.equal(breakdown.finalAmountPayableGbp, ONE_WAY);
});

check("no follow-up 5% email is scheduled or sent after a one-way booking", () => {
  assert.equal(RETURN_FOLLOW_UP_OFFER_ENABLED, false);
  const worker = read("workers/addresses/src/index.ts");
  const handlers = read("workers/addresses/src/return-offer-handlers.ts");
  const shared = read("shared/return-offer.ts");
  const workerShared = read("workers/addresses/shared/return-offer.ts");
  assert.match(shared, /RETURN_FOLLOW_UP_OFFER_ENABLED = false/);
  assert.match(workerShared, /RETURN_FOLLOW_UP_OFFER_ENABLED = false/);
  assert.doesNotMatch(worker, /processDueReturnOffers/);
  assert.doesNotMatch(worker, /Return journey offer cron/);

  const processor = handlers.slice(handlers.indexOf("export async function processDueReturnOffers"));
  const processorGate = processor.indexOf("if (!RETURN_FOLLOW_UP_OFFER_ENABLED)");
  const processorScan = processor.indexOf("listRecentPaidBookings");
  assert.ok(processorGate >= 0 && processorGate < processorScan);

  const deliver = handlers.slice(handlers.indexOf("async function deliverClaimedReturnOfferEmail"));
  const deliverGate = deliver.indexOf('if (!RETURN_FOLLOW_UP_OFFER_ENABLED) return "skipped"');
  const deliverSend = deliver.indexOf("trySendBrandedCustomerEmail");
  assert.ok(deliverGate >= 0 && deliverGate < deliverSend);

  const manual = handlers.slice(handlers.indexOf("export async function handleManualReturnOfferSend"));
  const manualGate = manual.indexOf('reason: "follow_up_offer_disabled"');
  const manualDeliver = manual.indexOf("deliverClaimedReturnOfferEmail");
  assert.ok(manualGate >= 0 && manualGate < manualDeliver);
  assert.match(manual, /410/);

  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /RETURN_FOLLOW_UP_OFFER_ENABLED &&/);
  const book = read("src/app/book/page.tsx");
  assert.doesNotMatch(book, /Your 5% saving has been applied automatically/);
});

check("a later separate booking does not inherit the 5% return discount", () => {
  const apply = shouldApplyReturnOfferDiscount({
    tokenValid: true,
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "12 High Street, Belfast",
    returnJourney: false,
  });
  assert.equal(apply, false);
  const later = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: ONE_WAY,
    airportFixedCostsGbp: 0,
    returnJourney: false,
    ...(apply ? { returnOfferDiscountRate: 0.05 } : {}),
  });
  assert.equal(later.returnOfferSavingGbp, 0);
  assert.equal(later.returnJourneySavingGbp, 0);
  assert.equal(later.finalAmountPayableGbp, ONE_WAY);
});

check("discontinued £5 first-booking discount stays absent", () => {
  const discount = read("shared/return-journey-discount.ts");
  const fare = read("shared/website-fare-breakdown.ts");
  assert.doesNotMatch(discount, /firstBooking|FIRST_BOOKING|first-booking|£5/i);
  assert.doesNotMatch(fare, /firstBooking|FIRST_BOOKING|first-booking/i);
  assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, 0.05);
});
