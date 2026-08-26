/**
 * Address-to-Address personalised quote helpers + validity minutes (any integer ≥ 1).
 * Run: npx tsx scripts/check-a2a-personalised-quote.ts
 */

import assert from "node:assert/strict";
import {
  A2A_QUOTE_VALIDITY_DEFAULT_MINUTES,
  A2A_QUOTE_VALIDITY_MAX_MINUTES,
  A2A_QUOTE_VALIDITY_MIN_MINUTES,
  a2aQuoteStatusLabel,
  computeA2aQuoteExpiresAtIso,
  formatA2aQuoteValidityLabel,
  isA2aQuotePayable,
  normalizeA2aQuotedPriceGbp,
  normalizeA2aQuoteValidityMinutes,
  type A2aQuoteRequestRecord,
} from "../shared/a2a-personalised-quote";
import { needsManualQuoteApproval, type SelectedPlace } from "../src/lib/selected-place";

function place(partial: Partial<SelectedPlace> & Pick<SelectedPlace, "formattedAddress">): SelectedPlace {
  return {
    placeId: partial.placeId ?? `test:${partial.formattedAddress.slice(0, 12)}`,
    formattedAddress: partial.formattedAddress,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    countryCode: partial.countryCode ?? null,
    postalCode: partial.postalCode ?? null,
  };
}

console.log("=== Validity minutes (any whole minutes) ===");
assert.equal(normalizeA2aQuoteValidityMinutes(1), 1);
assert.equal(normalizeA2aQuoteValidityMinutes(10), 10);
assert.equal(normalizeA2aQuoteValidityMinutes(60), 60);
assert.equal(normalizeA2aQuoteValidityMinutes(90), 90);
assert.equal(normalizeA2aQuoteValidityMinutes("45"), 45);
assert.equal(normalizeA2aQuoteValidityMinutes(0), null);
assert.equal(normalizeA2aQuoteValidityMinutes(1.5), null);
assert.equal(normalizeA2aQuoteValidityMinutes(-5), null);
assert.equal(normalizeA2aQuoteValidityMinutes(""), null);
assert.equal(normalizeA2aQuoteValidityMinutes(A2A_QUOTE_VALIDITY_MAX_MINUTES + 1), null);
assert.equal(A2A_QUOTE_VALIDITY_MIN_MINUTES, 1);
assert.equal(A2A_QUOTE_VALIDITY_DEFAULT_MINUTES, 60);
assert.equal(formatA2aQuoteValidityLabel(1), "1 minute");
assert.equal(formatA2aQuoteValidityLabel(10), "10 minutes");
assert.equal(formatA2aQuoteValidityLabel(60), "1 hour");
console.log("OK  1 / 10 / 60 minutes and rejection of invalid values");

console.log("\n=== Server-side expiry ===");
const approvedAt = "2026-08-26T12:00:00.000Z";
assert.equal(computeA2aQuoteExpiresAtIso(approvedAt, 1), "2026-08-26T12:01:00.000Z");
assert.equal(computeA2aQuoteExpiresAtIso(approvedAt, 10), "2026-08-26T12:10:00.000Z");
assert.equal(computeA2aQuoteExpiresAtIso(approvedAt, 60), "2026-08-26T13:00:00.000Z");
console.log("OK  expiry = approvedAt + N minutes");

console.log("\n=== Quoted price ===");
assert.equal(normalizeA2aQuotedPriceGbp(42), 42);
assert.equal(normalizeA2aQuotedPriceGbp("42.50"), 42.5);
assert.equal(normalizeA2aQuotedPriceGbp(0.5), null);
assert.equal(a2aQuoteStatusLabel("AWAITING_QUOTE"), "Awaiting Quote");
assert.equal(
  a2aQuoteStatusLabel("QUOTE_APPROVED_AWAITING_PAYMENT"),
  "Quote Approved – Awaiting Payment",
);
console.log("OK  price + status labels");

console.log("\n=== Payable / expired ===");
const baseBooking = {
  customerName: "Test",
  customerEmail: "test@example.com",
  mobileNumber: "07700900000",
  tripLabel: "Address to Address",
  pickupLabel: "Boucher Playing Fields",
  dropoffLabel: "Belfast City Hall",
  returnJourney: false,
  tripDate: "2026-08-30",
  tripTime: "16:00",
  returnDate: "",
  returnTime: "",
  flightNumber: "",
  passengers: 2,
  suitcases: 2,
  vehicle: "Saloon",
  isAirportTrip: false,
};
const approved: A2aQuoteRequestRecord = {
  reference: "MATNI-AQ-TEST",
  paymentToken: "abc",
  status: "QUOTE_APPROVED_AWAITING_PAYMENT",
  booking: baseBooking as A2aQuoteRequestRecord["booking"],
  createdAt: approvedAt,
  updatedAt: approvedAt,
  quotedPrice: 24,
  quoteApprovedAt: approvedAt,
  quoteValidityMinutes: 10,
  quoteExpiresAt: computeA2aQuoteExpiresAtIso(approvedAt, 10),
};
assert.equal(isA2aQuotePayable(approved, new Date("2026-08-26T12:05:00.000Z")), true);
assert.equal(isA2aQuotePayable(approved, new Date("2026-08-26T12:11:00.000Z")), false);
console.log("OK  payable within validity; not after expiry");

console.log("\n=== Pure A2A gated ===");
const city = place({
  formattedAddress: "Belfast City Hall, Belfast BT1 5GS, UK",
  countryCode: "GB",
  postalCode: "BT1 5GS",
});
const boucher = place({
  formattedAddress: "Boucher Playing Fields, Belfast BT12 6HR, UK",
  countryCode: "GB",
  postalCode: "BT12 6HR",
});
assert.equal(needsManualQuoteApproval(city, boucher), true);
console.log("OK  Boucher↔city centre needs personalised quote");

console.log("\nAll A2A personalised quote checks passed.");
