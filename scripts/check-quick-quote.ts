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
import { parseQuickQuoteMessage, parseUkDate, parseUkTime } from "../shared/quick-quote-parse";
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

console.log("=== Return journey date/time required by parser ===");
const oneWay = parseQuickQuoteMessage(
  "Hi need taxi to Belfast International tomorrow 18/08/2026 at 14:30 for 2 passengers 2 bags from 12 Donegall Square North Belfast",
);
assert.ok(oneWay.airportCode.value === "BFS" || oneWay.dropoffAddress.value);
assert.equal(parseUkDate("18/08/2026"), "2026-08-18");
assert.equal(parseUkTime("2:30pm"), "14:30");

const returnMsg = parseQuickQuoteMessage(
  "Return trip Belfast City Airport from Hotel Europa 20/08/2026 09:00 returning 22/08/2026 18:30 2 passengers 1 suitcase",
);
assert.equal(returnMsg.returnJourney.value, true);
assert.ok(returnMsg.missingMandatoryForQuote.includes("returnDate") || returnMsg.returnDate.value);
// If dates extracted, return date/time should be present for return journeys.
if (returnMsg.returnJourney.value === true) {
  const needs =
    !returnMsg.returnDate.value || !returnMsg.returnTime.value
      ? returnMsg.missingMandatoryForQuote
      : [];
  if (!returnMsg.returnDate.value) assert.ok(needs.includes("returnDate"));
  if (!returnMsg.returnTime.value) assert.ok(needs.includes("returnTime"));
}

console.log("=== Missing fields flagged ===");
const sparse = parseQuickQuoteMessage("Hi can I get a price please");
assert.ok(sparse.missingMandatoryForQuote.length >= 3);
assert.ok(sparse.uncertainFields.length >= 0);

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
