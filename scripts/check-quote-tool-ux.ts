/**
 * Smoke checks for the progressive quote-tool UX (journey intent, 1–4 capacity).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

const card = read("src/components/QuoteCard.tsx");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const intent = read("src/lib/quote-journey-intent.ts");
const selectedPlace = read("src/lib/selected-place.ts");
const inclusions = read("shared/journey-inclusions.ts");
const data = read("src/lib/data.ts");

check("Journey intent options include three large choices", () => {
  assert.match(intent, /To an Airport/);
  assert.match(intent, /From an Airport/);
  assert.match(intent, /Address to Address/);
  assert.match(progressive, /Where are you travelling\?/);
});

check("Airport picker lists BFS / BHD / LDY / DUB without typing", () => {
  assert.match(intent, /Belfast International Airport/);
  assert.match(intent, /Belfast City Airport/);
  assert.match(intent, /City of Derry Airport/);
  assert.match(intent, /Dublin Airport/);
  assert.match(intent, /code: "LDY"/);
  assert.match(progressive, /Which airport\?/);
  assert.match(selectedPlace, /"LDY"/);
});

check("City of Derry quick-select does not use Dublin toll logic", () => {
  assert.match(inclusions, /=== "DUB"/);
  assert.doesNotMatch(inclusions, /LDY.*toll|toll.*LDY/i);
});

check("Passenger and luggage use selectable buttons", () => {
  assert.match(progressive, /Passengers/);
  assert.match(progressive, /Suitcases \/ large bags/);
  assert.doesNotMatch(progressive, /Child seats/);
  assert.match(progressive, /One way/);
  assert.match(progressive, /Return/);
});

check("Public quote tool has no child/car seat question", () => {
  assert.doesNotMatch(progressive, /Child seats|Child seat details|car seat/i);
  assert.doesNotMatch(card, /onChildSeatsChange|setChildSeats|childSeatNotes/);
  assert.doesNotMatch(card, /label=\"Child seats\"/);
});

check("Public quote is 1–4 passengers only (no 5–7 / minibus path)", () => {
  assert.match(progressive, /options=\{\[1, 2, 3, 4\]\}/);
  assert.match(progressive, /Private airport transfer for 1–4 passengers/);
  assert.doesNotMatch(progressive, /Travelling with 5–7 passengers\?/);
  assert.doesNotMatch(progressive, /FIVE_PLUS_PASSENGERS/);
  assert.doesNotMatch(progressive, /options=\{\[5, 6, 7\]\}/);
  assert.doesNotMatch(progressive, /Minibus — 5–7/);
  assert.match(data, /MAX_ONLINE_PASSENGERS = 4/);
  assert.match(card, /PASSENGER_LIMIT_ERROR/);
  assert.match(card, /canPayNowOnline/);
  assert.doesNotMatch(progressive, /10\+|up to 8|5 or more passengers/);
});

check("Flight number only at booking for airport pickups — not during Get a Quote", () => {
  assert.doesNotMatch(progressive, /progressive-flight-number|Flight number/);
  assert.doesNotMatch(progressive, /AIRPORT_FLIGHT_MONITORING_COPY|We monitor your flight/);
  assert.match(card, /BOOKING_FLIGHT_NUMBER_HELPER/);
  assert.match(card, /quoteStep === 3/);
  assert.match(card, /enabled=\{quoteStep === 3\}/);
  assert.doesNotMatch(card, /Providing your flight number helps us monitor your arrival/);
  assert.doesNotMatch(card, /enabled=\{quoteStep === 2\}/);
  // Going flight only when pickup is from airport; return flight only when return is airport pickup
  assert.match(card, /isAirportTrip && isFromAirport/);
  assert.match(card, /isAirportTrip && !isFromAirport/);
});

check("Waiting-time copy is centralised correctly", () => {
  assert.match(inclusions, /60 minutes complimentary waiting/);
  assert.match(inclusions, /10 minutes complimentary waiting/);
  assert.doesNotMatch(inclusions, /Southern Ireland/);
});

check("QuoteCard uses progressive route for A2A primary flow", () => {
  assert.match(card, /QuoteProgressiveRoute/);
  assert.match(card, /applyJourneyIntent/);
  assert.match(card, /Your Journey/);
});

check("Step 2 travel details section scrolls only after explicit step navigation", () => {
  assert.match(card, /id="step2-travel-details"/);
  assert.match(card, /step2TravelDetailsRef/);
  assert.match(card, /pendingQuoteStepNavScrollRef/);
  assert.match(card, /scrollQuoteStage/);
  assert.doesNotMatch(card, /pendingScrollToStep2DateRef/);
  assert.doesNotMatch(card, /scheduleSmoothScrollTo/);
});

check("Progressive quote scrolls owned by QuoteCard; progressive exposes targets only", () => {
  assert.match(progressive, /quote-section-passengers/);
  assert.match(progressive, /quote-section-suitcases/);
  assert.match(progressive, /id="journey-type-selector"/);
  assert.match(progressive, /id="passenger-luggage-section"/);
  assert.doesNotMatch(progressive, /scheduleBookingNavAfterRender/);
  assert.doesNotMatch(progressive, /scheduleQuoteSectionScroll/);
  assert.doesNotMatch(progressive, /scheduleQuoteFareResultScroll/);
  assert.doesNotMatch(progressive, /quote-mobile-scroll/);
  assert.match(card, /scrollQuoteStage\("journey-type-selector"\)/);
  assert.match(card, /scrollQuoteStage\("passenger-luggage-section"\)/);
  assert.match(card, /quote-step1-next/);
  assert.match(card, /quote-step2-next/);
});

check("Public quote tool uses booking-nav scroll (no scrollIntoView / legacy fare scroll)", () => {
  assert.equal(fs.existsSync(path.join(root, "src/lib/quote-mobile-scroll.ts")), false);
  assert.doesNotMatch(progressive, /scrollIntoView/);
  // QuoteCard must not call scrollIntoView directly; step nav uses the helper.
  assert.doesNotMatch(card, /\.scrollIntoView\s*\(/);
  assert.doesNotMatch(card, /pendingScrollToStep2DateRef/);
  assert.doesNotMatch(card, /pendingScrollToStep3CustomerRef/);
  assert.doesNotMatch(card, /scheduleReadyForScrollRef/);
  assert.match(card, /scrollQuoteStage/);
  assert.match(card, /schedulePreciseResultsScroll/);
});

check("Journey mode, passengers and suitcases start unselected; results scroll once when ready", () => {
  assert.match(card, /useState<"one-way" \| "return" \| null>\(null\)/);
  assert.match(card, /useState<number \| null>\(null\)/);
  assert.match(progressive, /Choose One way or Return to continue\./);
  assert.match(progressive, /Select your passenger and suitcase numbers to see your fixed price\./);
  assert.match(card, /canShowPrice = hasQuoteRoute && quoteChoicesReady/);
  assert.match(card, /quote-route-summary/);
  assert.match(card, /schedulePreciseResultsScroll\("quote-route-summary"\)/);
  assert.doesNotMatch(card, /scheduleBookingNavAfterRender\("quote-results-summary"/);
  assert.doesNotMatch(card, /setExactPassengers\(5\)/);
  assert.doesNotMatch(progressive, /aria-pressed=\{!returnJourney\}/);
});

check("Suitcase selector is 0–4 only (no 5+ public option)", () => {
  assert.match(progressive, /formatSuitcaseChoice/);
  assert.match(progressive, /options=\{\[0, 1, 2, 3, 4\]\}/);
  assert.doesNotMatch(progressive, /FIVE_PLUS_SUITCASES/);
  assert.doesNotMatch(progressive, /label="Exact large bags/);
  assert.doesNotMatch(progressive, /quote-section-exact-suitcases/);
});

check("No public 5–7 exact-passengers band", () => {
  assert.doesNotMatch(progressive, /quote-section-exact-passengers/);
  assert.doesNotMatch(progressive, /Travelling with 5–7 passengers/);
  assert.doesNotMatch(progressive, /pendingScrollToExactPassengersRef/);
  assert.doesNotMatch(progressive, /scheduleQuoteFareResultScroll/);
});

check("Public quote tool has no personal quote code-entry UI", () => {
  assert.doesNotMatch(card, /Have a personal quote\?/);
  assert.doesNotMatch(card, /Apply Quote/);
  assert.doesNotMatch(card, /id="personal-quote-code"/);
  assert.doesNotMatch(card, /placeholder="Quote code"/);
  assert.doesNotMatch(card, /Remove quote code/);
  // Direct personal / quick quote customer links remain separate pages.
  const personalPage = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  const bookQuote = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
  assert.match(personalPage, /personal quote/i);
  assert.match(bookQuote, /fetchQuickQuoteById|Quick Quote/i);
});

check("Short-notice success UI after full form submit", () => {
  assert.match(card, /shortNoticeResult/);
  assert.match(card, /Booking requires availability confirmation/);
  assert.match(card, /confirm availability for your requested pickup time before taking/);
});

console.log("\nAll quote-tool UX checks passed.");
