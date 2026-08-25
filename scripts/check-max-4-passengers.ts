/**
 * Public website capacity: 1–4 passengers only.
 * Run: npx tsx scripts/check-max-4-passengers.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_PASSENGERS,
  INSTANT_QUOTE_MAX_PASSENGERS,
  OWNER_QUICK_QUOTE_MAX_PASSENGERS,
  PASSENGER_LIMIT_ERROR,
  isValidPassengerCount,
  isValidOwnerQuickQuotePassengerCount,
  clampPassengerCount,
} from "../shared/passenger-limits";
import { MAX_ONLINE_PASSENGERS } from "../src/lib/data";
import { QUICK_QUOTE_MINIBUS_MAX_PASSENGERS } from "../shared/quick-quote";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Limits ===");
assert.equal(MAX_PASSENGERS, 4);
assert.equal(INSTANT_QUOTE_MAX_PASSENGERS, 4);
assert.equal(MAX_ONLINE_PASSENGERS, 4);
assert.equal(OWNER_QUICK_QUOTE_MAX_PASSENGERS, 7);
assert.equal(QUICK_QUOTE_MINIBUS_MAX_PASSENGERS, 7);
assert.equal(isValidPassengerCount(4), true);
assert.equal(isValidPassengerCount(5), false);
assert.equal(isValidPassengerCount(7), false);
assert.equal(isValidOwnerQuickQuotePassengerCount(7), true);
assert.equal(clampPassengerCount(9), 4);
assert.match(PASSENGER_LIMIT_ERROR, /up to 4 passengers/);
console.log("OK  public max 4; owner QQ minibus still 7");

console.log("\n=== Public UI ===");
{
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  const card = read("src/components/QuoteCard.tsx");
  const tour = read("src/components/TourBookingForm.tsx");
  assert.match(progressive, /options=\{\[1, 2, 3, 4\]\}/);
  assert.match(progressive, /options=\{\[0, 1, 2, 3, 4\]\}/);
  assert.doesNotMatch(progressive, /5–7 passengers|FIVE_PLUS_PASSENGERS|Minibus — 5–7/);
  assert.match(card, /PASSENGER_LIMIT_ERROR/);
  assert.doesNotMatch(card, /Request Minibus Quote|Travelling with 5–7/);
  assert.match(tour, /Up to 4 passengers/);
  assert.match(tour, /Array\.from\(\{ length: 4 \}/);
}
console.log("OK  selectors and copy capped at 1–4");

console.log("\n=== Marketing / legal / bot ===");
{
  const data = read("src/lib/data.ts");
  const terms = read("src/lib/terms.ts");
  const assistant = read("src/lib/quote-assistant.ts");
  const vehicles = read("src/components/VehiclesSection.tsx");
  assert.doesNotMatch(data, /1–4 or 5–7 made simple/);
  assert.match(data, /Private transfers for 1–4 passengers|up to 4 passengers/i);
  assert.doesNotMatch(data, /name: "Minibus — 5–7 passengers"/);
  assert.match(terms, /up to 4 passengers/);
  assert.doesNotMatch(terms, /licensed transport partner minibus|more than 7 passengers/i);
  assert.doesNotMatch(assistant, /Online quotes cover 1–7/);
  assert.doesNotMatch(vehicles, /Minibus — 5–7 passengers/);
}
console.log("OK  public-facing 5–7 / minibus marketing removed");

console.log("\n=== Server validation wired ===");
{
  const createPayment = read("src/lib/create-payment.ts");
  const submit = read("src/lib/submit-booking.ts");
  const worker = read("workers/addresses/src/index.ts");
  const quoteService = read("src/lib/quote-service.ts");
  assert.match(createPayment, /isValidPassengerCount/);
  assert.match(submit, /isValidPassengerCount/);
  assert.match(worker, /isValidPassengerCount/);
  assert.match(worker, /PASSENGER_LIMIT_ERROR/);
  assert.match(quoteService, /OWNER_QUICK_QUOTE_MAX_PASSENGERS/);
  assert.match(quoteService, /PASSENGER_LIMIT_ERROR/);
  assert.doesNotMatch(quoteService, /speak to Colin for larger parties/);
  const amendment = read("workers/addresses/src/booking-amendment-handlers.ts");
  assert.match(amendment, /isValidPassengerCount/);
  assert.match(amendment, /PASSENGER_LIMIT_ERROR/);
  assert.doesNotMatch(amendment, /contact us for larger groups/i);
}
console.log("OK  payment/booking/worker/quote-service reject >4 on public path");

console.log("\nMax-4 passengers checks passed");
