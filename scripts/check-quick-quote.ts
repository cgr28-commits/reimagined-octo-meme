/**
 * Quick Quote workflow checks — parse, expiry, tampering guards, return legs.
 * Run: npx tsx scripts/check-quick-quote.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildQuickQuoteWhatsAppReply,
  generateQuickQuoteId,
  isQuickQuoteExpired,
  normalizeQuickQuoteId,
  quickQuoteAmountsEqual,
  QUICK_QUOTE_MAX_PASSENGERS,
  type QuickQuoteRecord,
} from "../shared/quick-quote";
import {
  addCalendarDays,
  parseQuickQuoteMessage,
  parseRelativeDateWord,
  parseUkDate,
  parseUkTime,
} from "../shared/quick-quote-parse";
import { todayLondonDate } from "../shared/uk-time";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateQuote } from "../src/lib/quote";

const root = path.resolve(import.meta.dirname, "..");

console.log("=== Passenger limit ===");
assert.equal(QUICK_QUOTE_MAX_PASSENGERS, 4);

console.log("=== Opaque token ===");
const id = generateQuickQuoteId();
assert.equal(id.length, 48);
assert.equal(normalizeQuickQuoteId(id), id);
assert.notEqual(generateQuickQuoteId(), generateQuickQuoteId());

console.log("=== Expiry ===");
const open: QuickQuoteRecord = {
  id,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  status: "open",
  journey: {
    pickupAddress: "A",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: false,
    outboundDate: "2026-08-20",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
  },
  quotedAmount: 50,
  quotedAmountLabel: "£50",
  pricingSource: "website-pricing-engine",
};
assert.equal(isQuickQuoteExpired(open), false);
const expired = { ...open, expiresAt: new Date(Date.now() - 1000).toISOString() };
assert.equal(isQuickQuoteExpired(expired), true);
assert.equal(isQuickQuoteExpired({ ...open, status: "expired" }), true);

console.log("=== Price equality / tampering helper ===");
assert.equal(quickQuoteAmountsEqual(50, 50), true);
assert.equal(quickQuoteAmountsEqual(50, 49.5), false);
assert.equal(quickQuoteAmountsEqual(50.001, 50), true);

console.log("=== Compact times + relative dates ===");
assert.equal(parseUkTime("1340"), "13:40");
assert.equal(parseUkTime("1620"), "16:20");
assert.equal(parseUkTime("13:40"), "13:40");
assert.equal(parseUkDate("18/08/2026"), "2026-08-18");
const fixedNow = new Date("2026-08-18T12:00:00.000Z");
assert.equal(parseRelativeDateWord("tomm", fixedNow).value, addCalendarDays(todayLondonDate(fixedNow), 1));
assert.equal(parseRelativeDateWord("tmrw", fixedNow).value, addCalendarDays(todayLondonDate(fixedNow), 1));
assert.equal(parseRelativeDateWord("tomorrow", fixedNow).value, addCalendarDays(todayLondonDate(fixedNow), 1));

console.log("=== Realistic WhatsApp regression (Ormeau → BFS tomm) ===");
const REAL_MSG =
  "Sure will do, by any chance I could check a price for an airport transfer from 55 ormeau road to Belfast international airport tomm at sat 1340 ( flight is at 1620)\n4 person 2 cabin baggage";
const real = parseQuickQuoteMessage(REAL_MSG, fixedNow);
const expectedTomorrow = addCalendarDays(todayLondonDate(fixedNow), 1);
assert.equal(real.pickupAddress.value, "55 Ormeau Road");
assert.equal(real.dropoffAddress.value, "Belfast International Airport");
assert.equal(real.airportCode.value, "BFS");
assert.equal(real.fromAirport.value, false);
assert.equal(real.returnJourney.value, false);
assert.equal(real.outboundDate.value, expectedTomorrow);
assert.equal(real.outboundTime.value, "13:40");
assert.equal(real.flightTime.value, "16:20");
assert.equal(real.passengers.value, 4);
assert.equal(real.suitcases.value, 2);
assert.equal(real.returnTime.value, null); // flight time must not become return time
assert.ok(!real.missingMandatoryForQuote.includes("pickupAddress"));
assert.ok(!real.missingMandatoryForQuote.includes("outboundDate"));
assert.ok(!real.missingMandatoryForQuote.includes("passengers"));
assert.ok(!real.missingMandatoryForQuote.includes("suitcases"));
assert.deepEqual(real.missingMandatoryForQuote, []);

console.log("=== Default one-way when return not mentioned ===");
const noReturnWord = parseQuickQuoteMessage(
  "Price from 12 Donegall Square to Belfast City Airport on 20/08/2026 at 10:00 2 passengers 1 bag",
);
assert.equal(noReturnWord.returnJourney.value, false);

console.log("=== Explicit return still detected ===");
const returnMsg = parseQuickQuoteMessage(
  "Return trip Belfast City Airport from Hotel Europa 20/08/2026 09:00 returning 22/08/2026 18:30 2 passengers 1 suitcase",
);
assert.equal(returnMsg.returnJourney.value, true);
if (returnMsg.returnJourney.value === true) {
  if (!returnMsg.returnDate.value) {
    assert.ok(returnMsg.missingMandatoryForQuote.includes("returnDate"));
  }
  if (!returnMsg.returnTime.value) {
    assert.ok(returnMsg.missingMandatoryForQuote.includes("returnTime"));
  }
}

console.log("=== Missing fields flagged ===");
const sparse = parseQuickQuoteMessage("Hi can I get a price please");
assert.ok(sparse.missingMandatoryForQuote.length >= 3);

console.log("=== Authoritative quote matches website engine ===");
const quote = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
  dropoffAddress: "Belfast International Airport",
  returnJourney: false,
  outboundDate: "2026-08-20",
  outboundTime: "10:00",
  passengers: 2,
  suitcases: 2,
});
assert.equal(quote.ok, true);
if (quote.ok) {
  const direct = calculateQuote(
    "Belfast City Hall, Belfast BT1 5GS",
    "BFS",
    quote.vehicleType,
    false,
    { outboundDate: "2026-08-20", outboundTime: "10:00" },
  );
  assert.ok(direct);
  assert.equal(quote.amount, direct!.amount);
}

const returnQuote = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
  dropoffAddress: "Belfast International Airport",
  returnJourney: true,
  outboundDate: "2026-08-20",
  outboundTime: "10:00",
  returnDate: "2026-08-22",
  returnTime: "18:00",
  passengers: 2,
  suitcases: 2,
});
assert.equal(returnQuote.ok, true);
if (returnQuote.ok) {
  assert.ok(returnQuote.amount > 0);
  assert.equal(returnQuote.returnJourney, true);
}

const tooMany = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
  returnJourney: false,
  outboundDate: "2026-08-20",
  outboundTime: "10:00",
  passengers: 5,
  suitcases: 2,
});
assert.equal(tooMany.ok, false);

console.log("=== WhatsApp reply copy ===");
const reply = buildQuickQuoteWhatsAppReply({
  amountLabel: "£55",
  bookingUrl: "https://www.myairporttaxini.co.uk/book-quote/?id=abc",
});
assert.match(reply, /£55/);
assert.match(reply, /book-quote/);
assert.match(reply, /My Airport Taxi NI/);

console.log("=== Wiring (no Meta WhatsApp) ===");
const index = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
assert.match(index, /\/quote\/calculate/);
assert.match(index, /\/owner\/quick-quotes/);
assert.match(index, /\/quick-quotes\/by-id/);
assert.match(index, /quickQuoteId/);
assert.doesNotMatch(index, /handleWhatsAppWebhookPost/);
assert.doesNotMatch(index, /META_WHATSAPP/);
assert.ok(fs.existsSync(path.join(root, "src/app/quick-quote/page.tsx")));
assert.ok(fs.existsSync(path.join(root, "src/app/book-quote/page.tsx")));
assert.ok(fs.existsSync(path.join(root, "src/lib/quote-service.ts")));
assert.ok(!fs.existsSync(path.join(root, "shared/whatsapp-meta.ts")));
assert.ok(!fs.existsSync(path.join(root, "workers/addresses/src/whatsapp-handlers.ts")));

console.log("\nAll Quick Quote checks passed.");
