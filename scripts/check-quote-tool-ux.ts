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

check("Suitcase selector is 0–4 and 5+ with no Exact Large Bags step", () => {
  assert.match(progressive, /options=\{\[0, 1, 2, 3, 4, FIVE_PLUS_SUITCASES\]\}/);
  assert.match(progressive, /formatOption=\{formatSuitcaseChoice\}/);
  assert.doesNotMatch(progressive, /Exact large bags|4\+/);
  assert.match(progressive, /formatSuitcaseChoice/);
  assert.match(
    read("src/lib/vehicle-selection.ts"),
    /count >= FIVE_PLUS_SUITCASES \? "5\+"/,
  );
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

check("Step 1 → 2 scrolls to DATE section after render (not page top)", () => {
  assert.match(card, /id="step2-travel-details"/);
  assert.match(card, /step2TravelDetailsRef/);
  assert.match(card, /pendingScrollToStep2DateRef/);
  assert.match(card, /scroll-mt-44/);
  assert.match(card, /md:scroll-mt-28/);
  assert.match(card, /pendingScrollToStep2DateRef\.current = true/);
  assert.match(card, /scheduleSmoothScrollTo/);
});

check("Short-notice success UI after full form submit", () => {
  assert.match(card, /shortNoticeResult/);
  assert.match(card, /Booking requires availability confirmation/);
  assert.match(card, /confirm availability for your requested pickup time before taking/);
});

console.log("\nAll quote-tool UX checks passed.");
