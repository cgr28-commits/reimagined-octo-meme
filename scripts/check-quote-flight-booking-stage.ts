/**
 * Flight number is collected on Step 2 (Travel details) for airport pickups only —
 * not during the public Get a Quote calculation stage (Step 1).
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

check("QuoteCard asks for flight number on Step 2 travel details (not Step 1)", () => {
  assert.match(card, /needsOutboundFlightNumber/);
  assert.match(card, /renderFlightDetailsSection\(2\)/);
  assert.match(card, /step2-flight-details/);
  assert.match(card, /BOOKING_FLIGHT_NUMBER_HELPER/);
  assert.match(card, /enabled=\{quoteStep === activeOnStep\}/);
  // After time Done, scroll to flight block when shown — not past it to journey summary.
  assert.match(card, /preferFlightDetails/);
  assert.match(card, /"step2-flight-details"/);
  // Must not reintroduce a second editable flight block on Step 3
  assert.doesNotMatch(card, /renderFlightDetailsSection\(3\)/);
  assert.doesNotMatch(card, /Providing your flight number helps us monitor your arrival/);
  assert.doesNotMatch(card, /flightNumber=\{goingFlightNumber\}/);
});

check("Airport drop-offs do not request an outbound flight number", () => {
  assert.match(card, /needsOutboundFlightNumber/);
  assert.match(card, /pickupAirportCode/);
  assert.match(card, /airport-to-address/);
  assert.match(card, /needsReturnCollectionFlightNumber/);
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
  assert.match(card, /flightNumber: goingFlightNumber/);
});

check("Flight number is required for airport pickups (blocks continue + payment)", () => {
  assert.match(card, /validateRequiredFlightNumbers/);
  assert.match(card, /FLIGHT_NUMBER_FORMAT_ERROR/);
  assert.match(card, /needsOutboundFlightNumber/);
  assert.match(card, /\(required\)/);
  assert.doesNotMatch(card, /Flight numbers are optional/);
  assert.doesNotMatch(card, /clearFlightBlockingErrors/);
  assert.doesNotMatch(card, /\(optional\)/);
});

check("Worker rejects invalid airport-pickup flight before SumUp", () => {
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /getAirportPickupFlightNumberBlockers/);
  assert.match(index, /invalid_flight_number/);
  const createPayment = read("src/lib/create-payment.ts");
  assert.match(createPayment, /getAirportPickupFlightNumberBlockers/);
});

console.log("\nAll quote-flight-booking-stage checks passed.");
