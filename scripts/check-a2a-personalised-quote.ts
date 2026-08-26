/**
 * Address-to-Address personalised quote helpers + validity minutes (any integer ≥ 1).
 * Run: npx tsx scripts/check-a2a-personalised-quote.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  A2A_QUOTE_VALIDITY_DEFAULT_MINUTES,
  A2A_QUOTE_VALIDITY_MAX_MINUTES,
  A2A_QUOTE_VALIDITY_MIN_MINUTES,
  A2A_QUOTE_VALIDITY_PRESETS_MINUTES,
  a2aQuoteStatusLabel,
  buildA2aPickupValidityWarning,
  computeA2aQuoteExpiresAtIso,
  formatA2aQuoteValidityLabel,
  isA2aQuotePayable,
  normalizeA2aQuotedPriceGbp,
  normalizeA2aQuoteValidityMinutes,
  type A2aQuoteRequestRecord,
} from "../shared/a2a-personalised-quote";
import { needsManualQuoteApproval, type SelectedPlace } from "../src/lib/selected-place";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}
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
assert.deepEqual([...A2A_QUOTE_VALIDITY_PRESETS_MINUTES], [5, 10, 15, 30, 60]);
console.log("OK  1 / 10 / 60 minutes and rejection of invalid values");

console.log("\n=== Near-pickup validity warning ===");
assert.match(
  buildA2aPickupValidityWarning({ minutesUntilPickup: 42 }) ?? "",
  /Pickup is in 42 minutes — consider a shorter quote validity/,
);
assert.match(
  buildA2aPickupValidityWarning({
    minutesUntilPickup: 42,
    selectedValidityMinutes: 60,
  }) ?? "",
  /60-minute validity is longer than time to pickup/,
);
assert.equal(
  buildA2aPickupValidityWarning({ minutesUntilPickup: 240 }),
  null,
);
assert.equal(
  buildA2aPickupValidityWarning({ minutesUntilPickup: -5 }),
  null,
);
console.log("OK  warning for near pickups; quiet when far or past");

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

console.log("\n=== Customer quote-request submit UX ===");
const quoteCard = read("src/components/QuoteCard.tsx");
const consent = read("src/components/BookingTermsConsent.tsx");
assert.match(consent, /mode: "card-payment" \| "booking-request" \| "quote-request"/);
assert.match(
  consent,
  /I understand this is a quote request\. My journey is not booked yet\. If the quote is\s+approved, I’ll receive my personalised price and a secure SumUp payment link/,
);
assert.match(quoteCard, /isManualQuoteJourney\s*\?\s*"quote-request"/);
assert.match(quoteCard, /"Submit Quote Request"/);
assert.match(quoteCard, /"Quote request received"/);
assert.match(
  quoteCard,
  /We’ve received your journey details\. We’ll review your request and send you your personalised price\. No payment has been taken\./,
);
assert.match(quoteCard, /pendingBookingResultScrollRef/);
assert.match(quoteCard, /bookingResultRef\.current \?\? "bookingRequestResult"/);
assert.match(quoteCard, /hadStep2ScheduleScrollRef/);
assert.match(quoteCard, /id="step2-journey-summary"/);
assert.match(quoteCard, /step2JourneySummaryRef\.current \?\? "step2-journey-summary"/);
const actionsStart = quoteCard.indexOf('id="step3-payment-actions"');
assert.ok(actionsStart > 0);
const actionsEnd = quoteCard.indexOf("{renderStartNewQuoteControls()}", actionsStart);
const actionsBlock = quoteCard.slice(actionsStart, actionsEnd);
assert.match(actionsBlock, /isManualQuoteJourney \? \(/);
assert.match(actionsBlock, /confirmButtonLabel/);
assert.doesNotMatch(
  actionsBlock.slice(actionsBlock.indexOf("isManualQuoteJourney ? ("), actionsBlock.indexOf("usesWhatsApp ? (")),
  /Choose how to send|Chat on WhatsApp|Send booking via email/,
);
console.log("OK  single Submit Quote Request + Agreement wording (no WhatsApp/email chooser)");
console.log("OK  confirmation card scrolls into view after submit");
console.log("OK  pickup-time complete scrolls once to YOUR JOURNEY summary");

console.log("\nAll A2A personalised quote checks passed.");
