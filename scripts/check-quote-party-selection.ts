/**
 * Acceptance: passenger + suitcase must be explicit (null until tapped).
 * Price only after both are selected; 0 bags is valid; no ||/?? defaults.
 * Run: npx tsx scripts/check-quote-party-selection.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { selectVehicleForParty, MINIBUS_VEHICLE } from "../src/lib/vehicle-selection";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

const card = read("src/components/QuoteCard.tsx");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const quoteHandlers = read("workers/addresses/src/quote-handlers.ts");
const quoteService = read("src/lib/quote-service.ts");
const savedQuote = read("workers/addresses/src/saved-quote-handlers.ts");
const quickQuoteHandlers = read("workers/addresses/src/quick-quote-handlers.ts");

check("Passengers and suitcases initialise as null (not 1 / 0)", () => {
  assert.match(card, /useState<number \| null>\(null\)/);
  assert.match(card, /setPassengers\(null\)/);
  assert.match(card, /setSuitcases\(null\)/);
  assert.doesNotMatch(card, /setPassengers\(1\)/);
  assert.doesNotMatch(card, /setSuitcases\(0\)/);
  assert.doesNotMatch(card, /setExactPassengers\(5\)/);
});

check("No passengers || 1 / suitcases || 0 (or ??) on quote pricing path", () => {
  assert.doesNotMatch(card, /passengers \|\| 1/);
  assert.doesNotMatch(card, /suitcases \|\| 0/);
  assert.doesNotMatch(card, /passengers \?\? 1/);
  assert.doesNotMatch(card, /suitcases \?\? 0/);
  assert.doesNotMatch(quoteHandlers, /Math\.floor\(passengers\) \|\| 1/);
  assert.doesNotMatch(quoteHandlers, /Math\.floor\(suitcases\) \|\| 0/);
  assert.doesNotMatch(quoteService, /passengers \|\| 1/);
  assert.doesNotMatch(quoteService, /suitcases \|\| 0/);
  assert.doesNotMatch(savedQuote, /Number\(j\.passengers\) \|\| 1/);
  assert.doesNotMatch(savedQuote, /Number\(j\.suitcases[\s\S]*?\) \|\| 0/);
});

check("Party prompt and gated price summary", () => {
  assert.match(progressive, /Select your passenger and suitcase numbers to see your fixed price\./);
  assert.match(card, /Select your passenger and suitcase numbers to see your fixed price\./);
  assert.match(card, /partySelectionReady/);
  assert.match(card, /canShowPrice = hasQuoteRoute && partySelectionReady/);
  assert.match(card, /partySelectionReady && \(/);
  assert.match(card, /id="quote-price-summary"/);
  assert.match(card, /!partySelectionReady/);
});

check("Choice grids accept null (nothing pre-selected)", () => {
  assert.match(progressive, /value: number \| null/);
  assert.match(progressive, /value !== null && value === option/);
  assert.match(card, /value: number \| null/);
  assert.match(card, /value !== null && value === option/);
});

check("Scroll: addresses → party, then price when ready", () => {
  assert.match(progressive, /scheduleBookingNavAfterRender\("quote-section-passengers"\)/);
  assert.match(card, /scheduleBookingNavAfterRender\("quote-price-summary"/);
  assert.match(card, /scheduleBookingNavAfterRender\("quote-section-passengers"\)/);
});

check("5–7 / Minibus path retained", () => {
  assert.match(progressive, /FIVE_PLUS_PASSENGERS/);
  assert.match(progressive, /options=\{\[5, 6, 7\]\}/);
  assert.equal(selectVehicleForParty(5, 0), MINIBUS_VEHICLE);
  assert.equal(selectVehicleForParty(7, 2), MINIBUS_VEHICLE);
});

check("Server rejects missing passenger or suitcase (null ≠ 0 bags)", () => {
  assert.match(quoteHandlers, /body\.passengers == null \|\| body\.suitcases == null/);
  assert.match(quoteService, /rawPassengers == null/);
  assert.match(quoteService, /rawSuitcases == null/);
  assert.match(quickQuoteHandlers, /body\.passengers == null \|\| body\.suitcases == null/);

  const missingPax = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: null as unknown as number,
    suitcases: 0,
  });
  assert.equal(missingPax.ok, false);

  const missingBags = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 1,
    suitcases: null as unknown as number,
  });
  assert.equal(missingBags.ok, false);

  const zeroBags = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 1,
    suitcases: 0,
  });
  assert.equal(zeroBags.ok, true);
  if (zeroBags.ok) {
    assert.ok(zeroBags.amount > 0);
  }

  const minibus = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 6,
    suitcases: 2,
    maxPassengers: 7,
  });
  assert.equal(minibus.ok, true);
});

check("Start New Quote clears party selections to null", () => {
  assert.match(card, /performStartNewQuote/);
  assert.match(card, /setPassengers\(null\)/);
  assert.match(card, /setSuitcases\(null\)/);
  assert.match(card, /setExactPassengers\(null\)/);
});

console.log("\nAll quote party-selection checks passed.");
