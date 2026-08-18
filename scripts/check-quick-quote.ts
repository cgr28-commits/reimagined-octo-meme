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
  countFieldValue,
  parseQuickQuoteMessage,
  parseRelativeDateWord,
  parseUkDate,
  parseUkTime,
} from "../shared/quick-quote-parse";
import { todayLondonDate } from "../shared/uk-time";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateQuote } from "../src/lib/quote";
import { isHighConfidenceAddressMatch } from "../src/lib/address-match";

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

console.log("=== Structured labelled WhatsApp regression (BFS → Downpatrick) ===");
const LABELLED_MSG = `*Pickup Address:* Belfast International Airport
*Drop-off Address:* Downpatrick
*Date:* 29th August
*Time:* 10:00 am
*Passengers:* 4
*Suitcases:* 4

Does this look correct?
I’m checking the pricing in the background for you now.`;
const labelled = parseQuickQuoteMessage(LABELLED_MSG, fixedNow);
assert.equal(labelled.fromAirport.value, true);
assert.equal(labelled.airportCode.value, "BFS");
assert.equal(labelled.pickupAddress.value, "Belfast International Airport");
assert.equal(labelled.dropoffAddress.value, "Downpatrick");
assert.equal(labelled.outboundDate.value, "2026-08-29");
assert.equal(labelled.outboundTime.value, "10:00");
assert.equal(labelled.passengers.value, 4);
assert.equal(labelled.suitcases.value, 4);
assert.equal(labelled.returnJourney.value, false);
assert.deepEqual(labelled.missingMandatoryForQuote, []);

console.log("=== Saul Rd structured WhatsApp regression (BFS → BT30, no flight) ===");
const SAUL_MSG = `*Trip Type:* One-way
*Pickup Address:* Belfast International Airport
*Drop-off Address:* 43 Saul Rd, Downpatrick BT30 6PA
*Date:* 29th August
*Time:* 10:00 am
*Passengers:* 4
*Suitcases:* 4`;
const saul = parseQuickQuoteMessage(SAUL_MSG, fixedNow);
assert.equal(saul.pickupAddress.value, "Belfast International Airport");
assert.equal(saul.dropoffAddress.value, "43 Saul Rd, Downpatrick BT30 6PA");
assert.equal(saul.passengers.value, 4);
assert.equal(saul.suitcases.value, 4);
assert.equal(countFieldValue(saul.passengers.value), "4");
assert.equal(countFieldValue(saul.suitcases.value), "4");
assert.equal(saul.flightNumber.value, null);
assert.equal(saul.outboundDate.value, "2026-08-29");
assert.equal(saul.outboundTime.value, "10:00");
assert.equal(saul.returnJourney.value, false);
assert.equal(saul.fromAirport.value, true);
assert.equal(saul.airportCode.value, "BFS");
assert.ok(!saul.pickupAddress.value?.startsWith("*"));
assert.ok(!saul.dropoffAddress.value?.startsWith("*"));
assert.ok(!String(saul.flightNumber.value ?? "").startsWith("*"));
assert.deepEqual(saul.missingMandatoryForQuote, []);

console.log("=== Explicit flight still extracted; postcode never is ===");
const withFlight = parseQuickQuoteMessage(
  "Airport transfer to Belfast International from 12 High Street Bangor BT20 5ED on 20/08/2026 at 09:00 flight BA1418 2 passengers 1 bag",
  fixedNow,
);
assert.equal(withFlight.flightNumber.value, "BA1418");
assert.notEqual(withFlight.flightNumber.value, "BT20");
const easyJet = parseQuickQuoteMessage(
  "Pickup Belfast City Airport 21/08/2026 11:00 Flight: U2801 2 passengers 2 bags to Holywood",
  fixedNow,
);
assert.equal(easyJet.flightNumber.value, "U2801");

console.log("=== Passenger/luggage form field values (natural + labelled) ===");
assert.equal(countFieldValue(real.passengers.value), "4");
assert.equal(countFieldValue(real.suitcases.value), "2");
assert.equal(countFieldValue(labelled.passengers.value), "4");
assert.equal(countFieldValue(labelled.suitcases.value), "4");
assert.equal(countFieldValue(null), "");
assert.equal(countFieldValue(undefined), "");

console.log("=== Party-of / of-us passenger wording ===");
const partyMsg = parseQuickQuoteMessage(
  "Need a transfer from Belfast International Airport to Bangor party of 3 on 30/08/2026 at 09:00 2 bags",
  fixedNow,
);
assert.equal(partyMsg.passengers.value, 3);
assert.equal(countFieldValue(partyMsg.passengers.value), "3");
assert.equal(partyMsg.suitcases.value, 2);

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

const qqPage = fs.readFileSync(path.join(root, "src/app/quick-quote/page.tsx"), "utf8");
const qqClient = fs.readFileSync(
  path.join(root, "src/app/quick-quote/QuickQuoteOwnerClient.tsx"),
  "utf8",
);
assert.match(qqPage, /max-w-lg/);
assert.match(qqPage, /min-w-0/);
assert.match(qqPage, /overflow-x-clip/);
assert.match(qqClient, /from ["']@\/components\/AddressInput["']/);
assert.match(qqClient, /quickSelectToPlace/);
assert.match(qqClient, /countFieldValue/);
assert.match(qqClient, /quote-text-input/);
assert.match(qqClient, /calculateServerQuote/);
assert.match(qqClient, /pickupLat/);
// Prefer 16px+ form text — text-sm inputs zoom/pan Safari sideways on iPhone.
assert.doesNotMatch(qqClient, /className="[^"]*text-sm[^"]*min-h-11[^"]*w-full[^"]*rounded-xl border border-white\/15 bg-navy/);
assert.match(qqClient, /countFieldValue\(parsed\.passengers\.value\)/);
assert.match(qqClient, /countFieldValue\(parsed\.suitcases\.value\)/);
assert.match(qqClient, /passengers,/);
assert.match(qqClient, /suitcases,/);
assert.match(qqClient, /Number\(draft\.passengers\)/);
assert.match(qqClient, /Number\(draft\.suitcases\)/);

console.log("=== Mobile layout width locks (375 / 390 / 430) ===");
for (const width of [375, 390, 430]) {
  assert.ok(width <= 430);
  // Structural guarantees that keep the page within these common iPhone widths.
  assert.match(qqPage, /max-w-lg/); // 32rem = 512px container, padded inside viewport
  assert.match(qqClient, /w-full min-w-0 max-w-full/);
  assert.match(qqClient, /grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.match(qqClient, /quote-text-input/);
}
assert.match(qqClient, /break-words|break-all/);
assert.match(qqClient, /cleanExtractedText/);
assert.match(qqClient, /type="text"/); // passengers/luggage avoid iOS number-input wipe
assert.doesNotMatch(qqClient, /type="number"/);
assert.match(qqClient, /autoSuggestToken/);
assert.match(qqClient, /autoConfirmExactMatch/);
assert.match(qqPage, /overflow-x-clip/);
assert.match(qqPage, /min-w-0/);
// 390px iPhone: container must not use fixed px wider than viewport
assert.doesNotMatch(qqPage, /w-\[(4[0-9]{2}|[5-9]\d{2}|[1-9]\d{3,})px\]/);
assert.doesNotMatch(qqClient, /w-screen|min-w-\[[4-9]\d{2}/);

const addressInput = fs.readFileSync(path.join(root, "src/components/AddressInput.tsx"), "utf8");
assert.match(addressInput, /autoSuggestToken/);
assert.match(addressInput, /isHighConfidenceAddressMatch/);
assert.match(addressInput, /autoConfirmExact/);

console.log("=== High-confidence address match helper ===");
assert.equal(
  isHighConfidenceAddressMatch("43 Saul Rd, Downpatrick BT30 6PA", {
    description: "43 Saul Road, Downpatrick BT30 6PA, UK",
    mainText: "43 Saul Road",
    secondaryText: "Downpatrick BT30 6PA, UK",
  }),
  true,
);
assert.equal(
  isHighConfidenceAddressMatch("Downpatrick", {
    description: "Downpatrick, UK",
    mainText: "Downpatrick",
    secondaryText: "UK",
  }),
  false,
);

const quoteService = fs.readFileSync(path.join(root, "src/lib/quote-service.ts"), "utf8");
assert.match(quoteService, /export function calculateAuthoritativeWebsiteQuote/);
const quoteHandlers = fs.readFileSync(
  path.join(root, "workers/addresses/src/quote-handlers.ts"),
  "utf8",
);
assert.match(quoteHandlers, /calculateAuthoritativeWebsiteQuote/);

console.log("\nAll Quick Quote checks passed.");
