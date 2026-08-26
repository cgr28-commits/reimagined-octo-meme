/**
 * Acceptance: journey mode + passenger + suitcase must be explicit (null until tapped).
 * Sequence: addresses → One way/Return → party → price → scroll to #quote-route-summary.
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
const scrollLib = read("src/lib/quote-step-nav-scroll.ts");

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
  assert.match(progressive, /Choose One way or Return to continue\./);
  assert.match(progressive, /Select your passenger and suitcase numbers to see your fixed price\./);
  assert.match(card, /quoteChoicesReady/);
  assert.match(card, /journeyMode !== null && partySelectionReady/);
  assert.match(card, /canShowPrice = hasQuoteRoute && quoteChoicesReady/);
  assert.match(card, /quoteChoicesReady && \(/);
  assert.match(progressive, /aria-pressed=\{journeyMode === "one-way"\}/);
  assert.match(progressive, /aria-pressed=\{journeyMode === "return"\}/);
  assert.doesNotMatch(progressive, /aria-pressed=\{!returnJourney\}/);
});

check("One way / Return centre divider and equal-width buttons", () => {
  assert.match(progressive, /id="journey-type-selector"/);
  assert.match(progressive, /border-l border-white\/40/);
  assert.match(progressive, /min-h-\[52px\]/);
  assert.match(progressive, /grid grid-cols-2/);
  assert.match(progressive, /type="button"/);
  assert.match(progressive, /focus-visible:outline/);
  assert.match(card, /border-l border-white\/40/);
});

check("Scroll sequence: journey-type → passengers → ready (owned by QuoteCard)", () => {
  // Progressive route exposes targets only — QuoteCard owns scrollQuoteStage.
  assert.doesNotMatch(progressive, /scheduleBookingNavAfterRender/);
  assert.match(progressive, /id="journey-type-selector"/);
  assert.match(progressive, /id="passenger-luggage-section"/);
  assert.match(card, /scrollQuoteStage\("journey-type-selector"\)/);
  assert.match(card, /scrollQuoteStage\("passenger-luggage-section"\)/);
  assert.match(card, /scrollQuoteStage\("quote-book-now-anchor"\)/);
  assert.match(card, /schedulePreciseResultsScroll\("quote-route-summary"\)/);
  assert.match(card, /id="quote-route-summary"|id=\{quoteResultsReady && quoteStep === 1 \? "quote-route-summary"/);
  assert.match(card, /hadStep1ReadyScrollRef/);
  assert.match(card, /quoteResultsReady/);
  assert.doesNotMatch(card, /scheduleBookingNavAfterRender\("quote-price-summary"/);
  assert.doesNotMatch(card, /scheduleBookingNavAfterRender\("quote-results-summary"/);
  assert.doesNotMatch(card, /schedulePreciseResultsScroll\("quote-price-summary"/);
});

check("Results order: Your Route → Vehicle → Price → Book Now; overflow-anchor none", () => {
  assert.match(card, /quote-route-summary/);
  assert.match(card, /Vehicle for this journey/);
  assert.match(card, /Your Fixed Journey Price/);
  assert.match(card, /sticky bottom-0/);
  assert.match(card, /overflowAnchor: "none"/);
  assert.match(read("src/components/TripMap.tsx"), /Your Route/);
  assert.match(scrollLib, /quote-route-summary/);
  assert.match(scrollLib, /schedulePreciseResultsScroll/);
  assert.match(scrollLib, /HEADER_CLEARANCE_PX = 16/);
  assert.match(scrollLib, /RESULTS_CORRECTION_MS = 150/);
  assert.match(scrollLib, /RESULTS_CORRECTION_TOLERANCE_PX = 4/);
  assert.match(scrollLib, /behavior: "auto"/);
});

check("Address changes clear downstream quote choices", () => {
  assert.match(card, /clearDownstreamQuoteChoices/);
  assert.match(card, /addressChanged/);
  assert.match(card, /showStageScrollKey/);
});

check("Party fields wait for journey mode", () => {
  assert.match(progressive, /showJourneyModeFields/);
  assert.match(progressive, /showPartyFields/);
  assert.match(card, /showPartyFields=\{\s*journeyMode != null &&/);
  assert.match(progressive, /id="passenger-luggage-section"/);
});

check("Public party selector is 1–4 only; engine still maps 5+ to Minibus for owner tools", () => {
  assert.match(progressive, /options=\{\[1, 2, 3, 4\]\}/);
  assert.doesNotMatch(progressive, /FIVE_PLUS_PASSENGERS/);
  assert.doesNotMatch(progressive, /options=\{\[5, 6, 7\]\}/);
  assert.equal(selectVehicleForParty(5, 0), MINIBUS_VEHICLE);
  assert.equal(selectVehicleForParty(7, 2), MINIBUS_VEHICLE);
  assert.equal(selectVehicleForParty(4, 2), "Standard Saloon (1–4 passengers)");
});

check("Server rejects missing journey mode / passenger / suitcase", () => {
  assert.match(quoteHandlers, /Journey mode \(One Way or Return\) is required/);
  assert.match(quoteHandlers, /typeof body\.returnJourney === "boolean"/);
  assert.match(quoteService, /Journey mode \(One Way or Return\) is required/);
  assert.match(quickQuoteHandlers, /typeof body\.returnJourney === "boolean"/);

  const cityBfsMetrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };

  const missingMode = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: undefined as unknown as boolean,
    passengers: 1,
    suitcases: 0,
    routeMetrics: cityBfsMetrics,
  });
  assert.equal(missingMode.ok, false);

  const missingPax = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: null as unknown as number,
    suitcases: 0,
    routeMetrics: cityBfsMetrics,
  });
  assert.equal(missingPax.ok, false);

  const missingBags = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 1,
    suitcases: null as unknown as number,
    routeMetrics: cityBfsMetrics,
  });
  assert.equal(missingBags.ok, false);

  const oneWay = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 1,
    suitcases: 0,
    routeMetrics: cityBfsMetrics,
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
    routeMetrics: cityBfsMetrics,
  });
  assert.equal(ret.ok, true);
  if (oneWay.ok && ret.ok) {
    // 5% return discount applies to journey fare only; airport fixed costs are added full both legs.
    assert.ok(ret.amount > oneWay.amount);
    assert.ok(ret.amount < oneWay.amount * 2);
    assert.ok(
      ret.amount > Math.round(oneWay.amount * 2 * 0.95 * 100) / 100,
      "return total must exceed a naïve 5% on the full one-way (fees not discounted)",
    );
  }

  // Public path (default ceiling 4) must reject >4.
  const publicOverCap = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 6,
    suitcases: 2,
    routeMetrics: cityBfsMetrics,
  });
  assert.equal(publicOverCap.ok, false);
  if (!publicOverCap.ok) {
    assert.equal(publicOverCap.reason, "passenger_limit");
  }

  // Owner Quick Quote Minibus may still price up to 7 via maxPassengers override.
  const minibus = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "10 Donegall Square North, Belfast BT1 5GB",
    returnJourney: false,
    passengers: 6,
    suitcases: 2,
    maxPassengers: 7,
    routeMetrics: cityBfsMetrics,
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
