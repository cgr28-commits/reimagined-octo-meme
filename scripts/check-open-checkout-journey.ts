/**
 * A saved "Secure payment ready" link must only be offered for the journey and price it was made for.
 * Regression for: a £47 link saved in the tab was offered on a later £238 quote for another journey.
 * Run: npx tsx scripts/check-open-checkout-journey.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildOpenCheckoutJourneyKey,
  openCheckoutForJourney,
  type OpenCheckoutJourney,
} from "../src/lib/booking-draft-storage";

const cityHallToBfs: OpenCheckoutJourney = {
  pickupAddress: "Belfast City Hall, Donegall Square N, Belfast BT1 5GS, UK",
  dropoffAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
  tripDate: "2026-11-20",
  tripTime: "10:00",
  journeyMode: "one-way",
  returnDate: "",
  returnTime: "",
  vehicle: "Saloon",
  amountLabel: "£48",
};
const key = buildOpenCheckoutJourneyKey(cityHallToBfs);
const saved = { paymentUrl: "https://example.test/pay/card/?checkout=cs_test_a", amountLabel: "£48", journeyKey: key };

// Same journey and price: offered again (customer came back from the payment page).
assert.equal(openCheckoutForJourney(saved, key), saved);
// Whitespace around addresses does not matter.
assert.equal(
  openCheckoutForJourney(saved, buildOpenCheckoutJourneyKey({ ...cityHallToBfs, pickupAddress: ` ${cityHallToBfs.pickupAddress} ` })),
  saved,
);

// Anything that changes the journey or the price hides it.
const changes: Array<Partial<OpenCheckoutJourney>> = [
  { dropoffAddress: "Dublin Airport, Co. Dublin, Ireland" },
  { pickupAddress: "Europa Hotel, Great Victoria St, Belfast BT2 7AP, UK" },
  { tripDate: "2026-12-20" },
  { tripTime: "11:00" },
  { journeyMode: "return", returnDate: "2026-11-27", returnTime: "18:30" },
  { vehicle: "Estate" },
  { amountLabel: "£238" },
  { amountLabel: "£58" },
];
for (const change of changes) {
  assert.equal(
    openCheckoutForJourney(saved, buildOpenCheckoutJourneyKey({ ...cityHallToBfs, ...change })),
    null,
    `must not offer the saved link after changing ${Object.keys(change).join(", ")}`,
  );
}

// Links saved before this fix (no journeyKey) are never offered again.
assert.equal(openCheckoutForJourney({ paymentUrl: "x", amountLabel: "£47" }, key), null);
assert.equal(openCheckoutForJourney(null, key), null);

// The quote card only reads the saved link through the journey check.
const quoteCard = readFileSync(join(process.cwd(), "src/components/QuoteCard.tsx"), "utf8");
assert.match(quoteCard, /const activeOpenCheckout = openCheckoutForJourney\(openCheckout, openCheckoutJourneyKey\)/);
assert.match(quoteCard, /journeyKey: openCheckoutJourneyKey,/);
assert.doesNotMatch(quoteCard, /Your booking details are saved for \{openCheckout\.amountLabel\}/);
assert.doesNotMatch(quoteCard, /openSumUpPayment\(openCheckout\.paymentUrl\)/);

console.log("check-open-checkout-journey: ok");
