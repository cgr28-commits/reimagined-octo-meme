/**
 * Smoke checks for the progressive quote-tool UX (journey intent, 5+ path, flight gating).
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
const bookingMessage = read("src/lib/booking-message.ts");
const inclusions = read("shared/journey-inclusions.ts");

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
  assert.match(progressive, /Which airport\?/);
  assert.match(selectedPlace, /code: "LDY"/);
});

check("City of Derry quick-select does not use Dublin toll logic", () => {
  assert.match(inclusions, /=== "DUB"/);
  assert.doesNotMatch(inclusions, /LDY.*toll|toll.*LDY/i);
});

check("Passenger and luggage use selectable buttons", () => {
  assert.match(progressive, /Passengers/);
  assert.match(progressive, /Suitcases \/ large bags/);
  assert.match(progressive, /Child seats/);
  assert.match(progressive, /One Way/);
  assert.match(progressive, /Return/);
});

check("5+ path requests tailored quote without inventing a fare", () => {
  assert.match(progressive, /Travelling with 5 or more passengers\?/);
  assert.match(progressive, /Request|tailored fixed-price quote/i);
  assert.match(card, /Tailored Quote Required/);
  assert.match(card, /Request Larger Vehicle Quote/);
  assert.match(card, /Continue to request quote/);
  assert.doesNotMatch(card, /disabled=\{\s*submitted \|\|\s*exceedsOnlineCapacity/);
  assert.match(bookingMessage, /MINIBUS \/ 5\+ PASSENGER QUOTE REQUEST/);
  assert.match(bookingMessage, /Quote Request Received/);
  assert.match(inclusions, /GROUP_QUOTE_FEE_NOTE/);
});

check("Flight number only for airport pickups", () => {
  assert.match(card, /Providing your flight number helps us monitor your arrival/);
  assert.match(card, /Boolean\(pickupAirportCode\)/);
  assert.match(card, /Boolean\(dropoffAirportCode\)/);
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

console.log("\nAll quote-tool UX checks passed.");
