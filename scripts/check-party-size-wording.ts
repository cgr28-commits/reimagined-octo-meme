/** Regression: plain-English passenger and suitcase wording across customer and dashboard views. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatPassengerCount,
  formatPassengerSuitcaseCounts,
  formatSuitcaseCount,
} from "../shared/party-size";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import { buildBookingMessage, type BookingDetails } from "../src/lib/booking-message";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

console.log("=== Singular and plural wording ===");
assert.equal(formatPassengerCount(1), "1 passenger");
assert.equal(formatPassengerCount(2), "2 passengers");
assert.equal(formatSuitcaseCount(0), "0 suitcases");
assert.equal(formatSuitcaseCount(1), "1 suitcase");
assert.equal(formatSuitcaseCount(2), "2 suitcases");
assert.equal(formatPassengerSuitcaseCounts(1, 1), "1 passenger • 1 suitcase");
assert.equal(formatPassengerSuitcaseCounts(2, 2), "2 passengers • 2 suitcases");
assert.equal(formatPassengerSuitcaseCounts("5+", "5+"), "5+ passengers • 5+ suitcases");
console.log("OK  formatter handles singular, plural, zero and 5+ display values");

const booking: BookingDetails = {
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  mobileNumber: "07700900123",
  tripLabel: "Airport transfer",
  pickupLabel: "Belfast",
  dropoffLabel: "Belfast International Airport",
  returnJourney: false,
  tripDate: "2026-09-01",
  tripTime: "09:30",
  returnDate: "",
  returnTime: "",
  flightNumber: "",
  passengers: 1,
  suitcases: 1,
  vehicle: "Standard Saloon (1–4 passengers)",
  estimatedPrice: "£40.00",
  isAirportTrip: true,
};

console.log("\n=== Customer and operational messages ===");
assert.match(buildBookingMessage(booking), /Party size: 1 passenger • 1 suitcase/);
const confirmation = buildCustomerConfirmationEmail({
  ...booking,
  amountPaid: "£40.00",
  paymentReference: "TEST-REFERENCE",
});
assert.match(confirmation.text, /Party size: 1 passenger • 1 suitcase/);
assert.match(confirmation.html, /1 passenger • 1 suitcase/);
assert.doesNotMatch(confirmation.text, /\bpax\b/i);
console.log("OK  booking and confirmation messages use the same wording");

console.log("\n=== Dashboard and public view contracts ===");
const displayFiles = [
  "src/components/OwnerPaidBookingsPanel.tsx",
  "src/components/OwnerShortNoticePanel.tsx",
  "src/app/driver/DriverPageClient.tsx",
  "src/app/driver-accept/DriverAcceptClient.tsx",
  "src/app/book-quote/BookQuoteCustomerClient.tsx",
  "src/app/quote/SavedQuoteCustomerClient.tsx",
  "src/components/QuoteAssistant.tsx",
  "src/components/QuoteCard.tsx",
];
for (const file of displayFiles) {
  assert.match(read(file), /formatPassengerSuitcaseCounts/, `${file} must use shared wording`);
}
const renderedSources = displayFiles.map(read).join("\n");
assert.doesNotMatch(renderedSources, /Passengers \/ luggage|Passengers \/ bags|Passengers \/ suitcases/i);
assert.doesNotMatch(read("src/components/OwnerPaidBookingsPanel.tsx"), /\bpax\b/i);
assert.equal(
  read("shared/party-size.ts"),
  read("workers/addresses/shared/party-size.ts"),
  "Worker party-size helper must mirror shared source",
);
assert.match(
  read("workers/addresses/src/google-calendar.ts"),
  /Party size: \$\{formatPassengerSuitcaseCounts\(booking\.passengers, booking\.suitcases\)\}/,
);
console.log("OK  Owner, Driver and customer views share the plain-English formatter");

console.log("\nAll party-size wording checks passed.");
