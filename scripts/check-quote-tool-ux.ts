/**
 * Smoke checks for the progressive quote-tool UX (journey intent, 5–7 path, flight gating).
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
  assert.match(progressive, /One Way/);
  assert.match(progressive, /Return/);
});

check("Public quote tool has no child/car seat question", () => {
  assert.doesNotMatch(progressive, /Child seats|Child seat details|car seat/i);
  assert.doesNotMatch(card, /onChildSeatsChange|setChildSeats|childSeatNotes/);
  assert.doesNotMatch(card, /label=\"Child seats\"/);
});

check("5–7 path is Minibus online quote + SumUp (existing pricing)", () => {
  assert.match(progressive, /Travelling with 5–7 passengers\?/);
  assert.match(progressive, /Minibus/);
  assert.match(progressive, /fixed Minibus fare online|pay securely/i);
  assert.match(data, /INSTANT_PAY_VEHICLE_TYPES/);
  assert.match(data, /MINIBUS_VEHICLE_TYPE/);
  assert.match(card, /Minibus selected for your party size/);
  assert.match(card, /canPayNowOnline/);
  assert.match(inclusions, /GROUP_QUOTE_FEE_NOTE/);
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
  assert.match(card, /scheduleMobileQuoteStepNavScroll/);
  assert.doesNotMatch(card, /pendingScrollToStep2DateRef/);
  assert.doesNotMatch(card, /scheduleSmoothScrollTo/);
});

check("Progressive quote sections stay in document flow without selection auto-scroll", () => {
  assert.match(progressive, /quote-section-passengers/);
  assert.match(progressive, /quote-section-suitcases/);
  assert.doesNotMatch(progressive, /scheduleQuoteSectionScroll/);
  assert.doesNotMatch(progressive, /scheduleQuoteFareResultScroll/);
  assert.doesNotMatch(progressive, /quote-mobile-scroll/);
  assert.match(card, /quote-step1-next/);
  assert.match(card, /quote-step2-next/);
});

check("Public quote tool does not auto-scroll after selections", () => {
  assert.equal(fs.existsSync(path.join(root, "src/lib/quote-mobile-scroll.ts")), false);
  assert.doesNotMatch(progressive, /scrollIntoView/);
  // QuoteCard must not call scrollIntoView directly; step nav uses the mobile helper.
  assert.doesNotMatch(card, /scrollIntoView/);
  assert.doesNotMatch(card, /pendingScrollToStep2DateRef/);
  assert.doesNotMatch(card, /pendingScrollToStep3CustomerRef/);
  assert.doesNotMatch(card, /scheduleReadyForScrollRef/);
  assert.match(card, /scheduleMobileQuoteStepNavScroll/);
});

check("Suitcase selector is single 0–4|5+ row without Exact Large Bags", () => {
  assert.match(progressive, /formatSuitcaseChoice/);
  assert.match(progressive, /options=\{\[0, 1, 2, 3, 4, FIVE_PLUS_SUITCASES\]\}/);
  assert.doesNotMatch(progressive, /label="Exact large bags/);
  assert.doesNotMatch(progressive, /quote-section-exact-suitcases/);
});

check("Exact passengers still available for 5–7; no fare auto-scroll", () => {
  assert.match(progressive, /quote-section-exact-passengers/);
  assert.match(progressive, /handleExactPassengersChange|Exact passengers/);
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
