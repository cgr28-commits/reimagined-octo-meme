/**
 * Flight number is collected at booking/checkout for airport pickups only —
 * not during the public Get a Quote calculation stage.
 * Run: npx tsx scripts/check-quote-flight-booking-stage.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { BOOKING_FLIGHT_NUMBER_HELPER } from "../shared/journey-inclusions";

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

const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const card = read("src/components/QuoteCard.tsx");
const bookQuote = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
const savedQuote = read("src/app/quote/SavedQuoteCustomerClient.tsx");
const personalQuote = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
const inclusions = read("shared/journey-inclusions.ts");
const flightLookup = read("shared/flight-lookup.ts");
const paidRecord = read("shared/paid-booking-record.ts");

check("BOOKING_FLIGHT_NUMBER_HELPER matches agreed customer copy", () => {
  assert.equal(
    BOOKING_FLIGHT_NUMBER_HELPER,
    "Used to monitor your flight and adjust your collection time if your flight arrives early or is delayed.",
  );
  assert.match(inclusions, /BOOKING_FLIGHT_NUMBER_HELPER/);
});

check("Get a Quote progressive route does not ask for flight number", () => {
  assert.doesNotMatch(progressive, /Flight number|flightNumber|onFlightNumberChange/);
  assert.doesNotMatch(progressive, /AIRPORT_FLIGHT_MONITORING_COPY|We monitor your flight/);
  assert.match(progressive, /AIRPORT_PICKUP_WAITING_COPY/);
});

check("QuoteCard asks for flight number only on booking step 3", () => {
  assert.match(card, /BOOKING_FLIGHT_NUMBER_HELPER/);
  assert.match(card, /enabled=\{quoteStep === 3\}/);
  assert.doesNotMatch(card, /enabled=\{quoteStep === 2\}/);
  assert.doesNotMatch(card, /Providing your flight number helps us monitor your arrival/);
  assert.doesNotMatch(card, /flightNumber=\{goingFlightNumber\}/);
});

check("Airport drop-offs do not request an outbound flight number", () => {
  // Going flight gated on isFromAirport / pickupAirportCode
  assert.match(card, /isAirportTrip && isFromAirport/);
  assert.match(card, /pickupAirportCode/);
  // Drop-off outbound uses !isFromAirport only for return collection flight
  assert.match(card, /isAirportTrip && !isFromAirport/);
});

check("Book / saved / personal quote booking UIs request flight for pickups only", () => {
  assert.match(bookQuote, /journey\.fromAirport/);
  assert.match(bookQuote, /Used to monitor your flight and adjust your collection time/);
  assert.match(savedQuote, /journey\.isFromAirport/);
  assert.match(savedQuote, /Used to monitor your flight and adjust your collection time/);
  assert.match(personalQuote, /airportMeta\.isFromAirport/);
  assert.match(personalQuote, /Used to monitor your flight and adjust your collection time/);
});

check("Flight monitoring + booking record still support flight numbers", () => {
  assert.match(flightLookup, /flightNumber/);
  assert.match(paidRecord, /flightNumber\?:/);
});

console.log("\nAll quote-flight-booking-stage checks passed.");
