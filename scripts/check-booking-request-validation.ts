/**
 * Unpaid POST /bookings stays a request: wording, conservative validation,
 * and quote-id duplicate protection. Does not require a signed payment receipt.
 *
 * Run: npx tsx scripts/check-booking-request-validation.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  existingRequestReferenceForQuote,
  validateUnpaidBookingRequest,
} from "../shared/booking-request-validation";
import {
  UNPAID_REQUEST_RECEIVED_BODY,
  UNPAID_REQUEST_RECEIVED_HEADING,
} from "../src/lib/unpaid-request-copy";

const root = path.resolve(import.meta.dirname, "..");
const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
const tour = fs.readFileSync(path.join(root, "src/components/TourBookingForm.tsx"), "utf8");
const assistant = fs.readFileSync(path.join(root, "src/lib/quote-assistant-submit.ts"), "utf8");
const worker = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
const paidCopy = fs.readFileSync(path.join(root, "src/lib/finalize-paid-booking.ts"), "utf8");

const now = new Date("2026-06-15T12:00:00Z");

function structuredBooking(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900123",
    tripLabel: "Airport pickup",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "12 Donegall Square, Belfast",
    returnJourney: false,
    tripDate: "2026-06-20",
    tripTime: "10:30",
    returnDate: "",
    returnTime: "",
    flightNumber: "BA1234",
    passengers: 2,
    suitcases: 1,
    vehicle: "Standard Saloon (1–4 passengers)",
    isAirportTrip: true,
    isFromAirport: true,
    airportCode: "BFS",
    termsAcceptedAt: "2026-06-15T12:00:00.000Z",
    ...overrides,
  };
}

console.log("=== Structured unpaid request ===");
{
  const result = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request details",
    booking: structuredBooking(),
    publicMinibusEnabled: false,
    now,
  });
  assert.equal(result.ok, true);
  const withoutPlaceId = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Chat request",
    booking: structuredBooking({ pickupPlaceId: undefined, dropoffPlaceId: undefined }),
    publicMinibusEnabled: false,
    now,
  });
  assert.equal(withoutPlaceId.ok, true, "chat and form requests do not need a Google place id");
  console.log("OK  structured request accepted without place ids or a payment receipt");
}

console.log("\n=== Chat-shaped request ===");
{
  const result = validateUnpaidBookingRequest({
    customerName: "Sam Chat",
    message: "Hi, I would like to request the following.",
    booking: structuredBooking({
      customerName: "Sam Chat",
      customerEmail: "sam@example.com",
      vehicle: "Estate Car (1–4 passengers)",
      isFromAirport: false,
      tripLabel: "Airport drop-off",
      flightNumber: "",
    }),
    publicMinibusEnabled: false,
    now,
  });
  assert.equal(result.ok, true);
  console.log("OK  to-airport chat request does not need an outbound flight number");
}

console.log("\n=== Manual and ROI requests ===");
{
  const roi = validateUnpaidBookingRequest({
    customerName: "Riley Manual",
    message: "Please quote this Republic of Ireland journey.",
    booking: structuredBooking({
      tripLabel: "Republic of Ireland long-distance transfer",
      pickupLabel: "Dublin city centre",
      dropoffLabel: "Galway city",
      isAirportTrip: false,
      isFromAirport: false,
      airportCode: "",
      flightNumber: "",
      vehicle: "Estate Car (1–4 passengers)",
    }),
    publicMinibusEnabled: false,
    now,
  });
  assert.equal(roi.ok, true);
  const executive = validateUnpaidBookingRequest({
    customerName: "Riley Manual",
    message: "Executive enquiry",
    booking: structuredBooking({
      vehicle: "Executive Saloon (1–4 passengers)",
      isFromAirport: false,
      tripLabel: "Airport drop-off",
      flightNumber: "",
    }),
    publicMinibusEnabled: false,
    now,
  });
  assert.equal(executive.ok, true);
  console.log("OK  ROI and executive enquiry requests stay accepted");
}

console.log("\n=== Tour request ===");
{
  const result = validateUnpaidBookingRequest({
    customerName: "Taylor Tour",
    message: "Day trip request",
    tour: {
      customerName: "Taylor Tour",
      mobileNumber: "07700900111",
      customerEmail: "",
      pickupLocation: "Belfast city centre",
      travelDate: "2026-07-01",
      groupSize: 3,
      termsAcceptedAt: "2026-06-15T12:00:00.000Z",
    },
    now,
  });
  assert.equal(result.ok, true);
  const namedOnly = validateUnpaidBookingRequest({
    customerName: "Taylor Tour",
    message: "Please call me about a day trip.",
    now,
  });
  assert.equal(namedOnly.ok, true, "a message without a booking payload is still accepted");
  const tourMissingTerms = validateUnpaidBookingRequest({
    customerName: "Taylor Tour",
    message: "Day trip request",
    tour: {
      customerName: "Taylor Tour",
      mobileNumber: "07700900111",
      pickupLocation: "Belfast city centre",
      travelDate: "2026-07-01",
      groupSize: 3,
      termsAcceptedAt: "",
    },
    now,
  });
  assert.equal(tourMissingTerms.ok, false);
  if (!tourMissingTerms.ok) {
    assert.equal(
      tourMissingTerms.error,
      "Please accept the Terms & Conditions before sending your request.",
    );
  }
  console.log("OK  tour request accepted without flight, place id, or vehicle");
}

console.log("\n=== Reject incomplete structured requests ===");
{
  const missingEmail = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ customerEmail: "" }),
    now,
  });
  assert.equal(missingEmail.ok, false);

  const badPhone = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ mobileNumber: "123" }),
    now,
  });
  assert.equal(badPhone.ok, false);

  const tooManyPassengers = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ passengers: 9 }),
    publicMinibusEnabled: true,
    now,
  });
  assert.equal(tooManyPassengers.ok, false);

  const badLuggage = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ suitcases: 9 }),
    publicMinibusEnabled: false,
    now,
  });
  assert.equal(badLuggage.ok, false);

  const pastDate = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ tripDate: "2020-01-01" }),
    now,
  });
  assert.equal(pastDate.ok, false);

  const impossibleDate = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ tripDate: "2026-02-31" }),
    now,
  });
  assert.equal(impossibleDate.ok, false);

  const missingReturn = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({
      returnJourney: true,
      returnDate: "",
      returnTime: "",
    }),
    now,
  });
  assert.equal(missingReturn.ok, false);

  const badAirport = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ airportCode: "LHR" }),
    now,
  });
  assert.equal(badAirport.ok, false);

  const missingFlight = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ flightNumber: "" }),
    now,
  });
  assert.equal(missingFlight.ok, false);

  const badVehicle = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ vehicle: "Helicopter" }),
    now,
  });
  assert.equal(badVehicle.ok, false);

  const minibusOff = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({
      vehicle: "Minibus (5–7 passengers)",
      passengers: 6,
      suitcases: 2,
    }),
    publicMinibusEnabled: false,
    now,
  });
  assert.equal(minibusOff.ok, false);

  const missingConsent = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Request",
    booking: structuredBooking({ termsAcceptedAt: "" }),
    now,
  });
  assert.equal(missingConsent.ok, false);
  if (!missingConsent.ok) {
    assert.equal(
      missingConsent.error,
      "Please accept the Terms & Conditions before sending your request.",
    );
  }
  const paidGate = fs.readFileSync(path.join(root, "shared/paid-booking-gate.ts"), "utf8");
  assert.match(paidGate, /Terms must be accepted before payment\./);

  console.log("OK  contact, capacity, dates, airport, flight, vehicle, and consent are enforced");
}

console.log("\n=== Return request ===");
{
  const result = validateUnpaidBookingRequest({
    customerName: "Alex Customer",
    message: "Return request",
    booking: structuredBooking({
      returnJourney: true,
      returnDate: "2026-06-22",
      returnTime: "18:00",
      returnFlightNumber: "EZY456",
      isFromAirport: false,
      tripLabel: "Airport drop-off",
      flightNumber: "",
    }),
    now,
  });
  assert.equal(result.ok, true);
  console.log("OK  return collection flight is accepted when the return starts at the airport");
}

console.log("\n=== Duplicate structured request ===");
{
  assert.equal(
    existingRequestReferenceForQuote({
      quoteTransactionId: "quote_abc123",
      storedReference: "MATNI-1008",
    }),
    "MATNI-1008",
  );
  assert.equal(
    existingRequestReferenceForQuote({
      quoteTransactionId: "quote_abc123",
      storedReference: null,
    }),
    null,
  );
  assert.equal(
    existingRequestReferenceForQuote({
      quoteTransactionId: "",
      storedReference: "MATNI-1008",
    }),
    null,
  );
  assert.equal(
    existingRequestReferenceForQuote({
      quoteTransactionId: "quote_abc123",
      storedReference: "MAT-1008",
    }),
    null,
    "paid MAT references are not reused as request references",
  );
  const handler = worker.slice(
    worker.indexOf("async function handleBookingRequest"),
    worker.indexOf("async function handleEmailStatusRequest"),
  );
  const validateAt = handler.indexOf("validateUnpaidBookingRequest");
  const duplicateAt = handler.indexOf("existingRequestReferenceForQuote");
  const allocateAt = handler.indexOf("allocateBookingReference");
  assert.ok(validateAt >= 0 && duplicateAt > validateAt && allocateAt > duplicateAt);
  assert.match(handler, /deduplicated: true/);
  assert.doesNotMatch(handler, /quoteReceipt/);
  assert.doesNotMatch(handler, /checkoutAmountsMatch/);
  console.log("OK  same quote id reuses MATNI; validation runs before a new reference");
}

console.log("\n=== Customer wording vs paid confirmation ===");
{
  assert.equal(UNPAID_REQUEST_RECEIVED_HEADING, "Request received — not yet confirmed");
  assert.match(UNPAID_REQUEST_RECEIVED_BODY, /It is not yet confirmed/);
  assert.match(card, /UNPAID_REQUEST_RECEIVED_HEADING/);
  assert.match(card, /UNPAID_REQUEST_RECEIVED_BODY/);
  assert.match(card, /Request reference:/);
  assert.match(card, /Send request by email/);
  assert.match(card, /Confirm booking & pay securely/);
  assert.doesNotMatch(card, /Booking submitted/);
  assert.doesNotMatch(card, /Confirm & book/);
  assert.match(tour, /UNPAID_REQUEST_RECEIVED_HEADING/);
  assert.match(tour, /Send request via WhatsApp/);
  assert.doesNotMatch(tour, /Confirm & book/);
  assert.match(assistant, /UNPAID_REQUEST_RECEIVED_HEADING/);
  assert.match(paidCopy, /Your booking is confirmed/);
  console.log("OK  unpaid flows say request; paid SumUp copy still says confirmed");
}

console.log("\nAll unpaid request checks passed.");
