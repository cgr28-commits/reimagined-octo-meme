/**
 * Acceptance: journey mode + passenger + suitcase must be explicit (null until tapped).
 * Sequence: addresses → One Way/Return → party → price.
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

check("Passengers, suitcases and journey mode initialise as null", () => {
  assert.match(card, /useState<"one-way" \| "return" \| null>\(null\)/);
  assert.match(card, /useState<number \| null>\(null\)/);
  assert.match(card, /setPassengers\(null\)/);
  assert.match(card, /setSuitcases\(null\)/);
  assert.match(card, /setJourneyMode\(null\)/);
  assert.doesNotMatch(card, /setPassengers\(1\)/);
  assert.doesNotMatch(card, /setSuitcases\(0\)/);
  assert.doesNotMatch(card, /setExactPassengers\(5\)/);
  assert.doesNotMatch(card, /useState\(false\).*returnJourney|setReturnJourney\(false\)/);
});

check("No silent One Way / 1 pax / 0 bags defaults on pricing path", () => {
  assert.doesNotMatch(card, /passengers \|\| 1/);
  assert.doesNotMatch(card, /suitcases \|\| 0/);
  assert.doesNotMatch(card, /passengers \?\? 1/);
  assert.doesNotMatch(card, /suitcases \?\? 0/);
  assert.doesNotMatch(card, /journeyMode \|\| ['"]one-way['"]/);
  assert.doesNotMatch(quoteHandlers, /Math\.floor\(passengers\) \|\| 1/);
  assert.doesNotMatch(quoteHandlers, /Math\.floor\(suitcases\) \|\| 0/);
  assert.doesNotMatch(quoteHandlers, /returnJourney: body\.returnJourney === true/);
  assert.doesNotMatch(quoteService, /passengers \|\| 1/);
  assert.doesNotMatch(quoteService, /suitcases \|\| 0/);
  assert.doesNotMatch(savedQuote, /Number\(j\.passengers\) \|\| 1/);
  assert.doesNotMatch(savedQuote, /Number\(j\.suitcases[\s\S]*?\) \|\| 0/);
});

check("Prompts and gated price until journey mode + party selected", () => {
  assert.match(progressive, /Choose One Way or Return to continue\./);
  assert.match(progressive, /Select your passenger and suitcase numbers to see your fixed price\./);
  assert.match(card, /quoteChoicesReady/);
  assert.match(card, /journeyMode !== null && partySelectionReady/);
  assert.match(card, /canShowPrice = hasQuoteRoute && quoteChoicesReady/);
  assert.match(card, /quoteChoicesReady && \(/);
  assert.match(progressive, /aria-pressed=\{journeyMode === "one-way"\}/);
  assert.match(progressive, /aria-pressed=\{journeyMode === "return"\}/);
  assert.doesNotMatch(progressive, /aria-pressed=\{!returnJourney\}/);
});

check("Scroll sequence: journey-mode → passengers → price", () => {
  assert.match(progressive, /scheduleBookingNavAfterRender\("quote-section-journey-mode"\)/);
  assert.match(progressive, /scheduleBookingNavAfterRender\("quote-section-passengers"\)/);
  assert.match(card, /scheduleBookingNavAfterRender\("quote-price-summary"/);
  assert.match(card, /scheduleBookingNavAfterRender\("quote-section-journey-mode"\)/);
  // Must not scroll to passengers when only addresses are ready.
  assert.doesNotMatch(
    progressive,
    /showJourneyModeFields[\s\S]{0,200}scheduleBookingNavAfterRender\("quote-section-passengers"\)/,
  );
});

check("Party fields wait for journey mode", () => {
  assert.match(progressive, /showJourneyModeFields/);
  assert.match(progressive, /showPartyFields/);
  assert.match(card, /showPartyFields=\{\s*journeyMode != null &&/);
});

check("5–7 / Minibus path retained", () => {
  assert.match(progressive, /FIVE_PLUS_PASSENGERS/);
  assert.match(progressive, /options=\{\[5, 6, 7\]\}/);
  assert.equal(selectVehicleForParty(5, 0), MINIBUS_VEHICLE);
  assert.equal(selectVehicleForParty(7, 2), MINIBUS_VEHICLE);
});

check("Server rejects missing journey mode / passenger / suitcase", () => {
  assert.match(quoteHandlers, /Journey mode \(One Way or Return\) is required/);
  assert.match(quoteHandlers, /typeof body\.returnJourney === "boolean"/);
  assert.match(quoteService, /Journey mode \(One Way or Return\) is required/);
  assert.match(quickQuoteHandlers, /typeof body\.returnJourney === "boolean"/);

  const missingMode = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: undefined as unknown as boolean,
    passengers: 1,
    suitcases: 0,
  });
  assert.equal(missingMode.ok, false);

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

  const oneWay = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 1,
    suitcases: 0,
  });
  assert.equal(oneWay.ok, true);
  if (oneWay.ok) {
    assert.ok(oneWay.amount > 0);
  }

  const ret = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: true,
    passengers: 1,
    suitcases: 0,
  });
  assert.equal(ret.ok, true);
  if (oneWay.ok && ret.ok) {
    // 5% return discount preserved (return ≈ one-way × 2 × 0.95)
    assert.equal(ret.amount, Math.round(oneWay.amount * 2 * 0.95 * 100) / 100);
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

check("Start New Quote clears journey mode and party selections", () => {
  assert.match(card, /performStartNewQuote/);
  assert.match(card, /setJourneyMode\(null\)/);
  assert.match(card, /setPassengers\(null\)/);
  assert.match(card, /setSuitcases\(null\)/);
  assert.match(card, /setExactPassengers\(null\)/);
});

console.log("\nAll quote party-selection checks passed.");
