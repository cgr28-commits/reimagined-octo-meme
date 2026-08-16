/**
 * Payment-started owner notification + SumUp new-tab UX checks.
 * Run: npx tsx scripts/check-sumup-payment-ux.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOwnerPaymentAttemptEmail } from "../shared/booking-notifications";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const booking = {
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  mobileNumber: "07700900123",
  tripLabel: "Airport drop-off",
  pickupLabel: "10 Donegall Square North, Belfast",
  dropoffLabel: "Belfast International Airport",
  returnJourney: false,
  tripDate: "2026-09-01",
  tripTime: "09:30",
  returnDate: "",
  returnTime: "",
  flightNumber: "",
  passengers: 2,
  suitcases: 2,
  vehicle: "Estate Car (1–4 passengers)",
  isAirportTrip: true,
  airportCode: "BFS",
  isFromAirport: false,
  termsAcceptedAt: "2026-08-16T12:00:00.000Z",
  termsVersion: "August 2026",
};

console.log("=== Owner payment-started notification ===");
const attempt = buildOwnerPaymentAttemptEmail(booking, {
  amountLabel: "£50.00",
  checkoutId: "chk_test",
  checkoutReference: "MAT-TEST-001",
});
assert.match(attempt.subject, /Customer details captured — payment started — £50\.00/);
assert.match(attempt.body, /alex@example\.com/i);
assert.match(attempt.body, /07700900123/);
assert.match(attempt.body, /Alex Example/);
assert.match(attempt.body, /Pickup:/);
assert.match(attempt.body, /Drop-off:/);
assert.match(attempt.body, /Passengers: 2/);
assert.match(attempt.body, /Vehicle:/);
assert.match(attempt.body, /Quoted fare: £50\.00/);
assert.match(attempt.body, /Checkout \/ booking reference: MAT-TEST-001/);
assert.match(attempt.body, /PAYMENT STARTED — NOT YET PAID/);
assert.doesNotMatch(attempt.body, /No contact details yet/i);
console.log("OK  payment-started subject/body include contacts + NOT YET PAID status");

assert.deepEqual(getPaymentBookingBlockers(booking), []);
console.log("OK  complete booking passes payment gate");

console.log("\n=== Worker email path (no FormSubmit for payment-stage) ===");
const workerEmail = read("workers/addresses/src/worker-email.ts");
const workerIndex = read("workers/addresses/src/index.ts");
assert.match(workerEmail, /preferWorkerProviders/);
assert.match(workerEmail, /trySendOwnerOperationalEmail/);
assert.match(workerEmail, /skipFormSubmit/);
assert.match(workerIndex, /trySendOwnerOperationalEmail\(env/);
assert.match(workerIndex, /buildOwnerPaymentAttemptEmail/);
// Payment attempt must use operational sender (not default FormSubmit-first path alone).
assert.match(
  workerIndex,
  /attemptSend = await trySendOwnerOperationalEmail/,
);
console.log("OK  payment-started uses trySendOwnerOperationalEmail (no FormSubmit preference)");

console.log("\n=== QuoteCard SumUp new-tab UX ===");
const card = read("src/components/QuoteCard.tsx");
assert.match(card, /Payment opened in a new tab/);
assert.match(card, /Return to \/ Edit booking/);
assert.match(card, /Open payment again/);
assert.match(card, /Secure payment will open in a new tab/);
assert.match(card, /window\.open\(checkout\.paymentUrl, "_blank"/);
assert.doesNotMatch(card, /location\.assign\(checkout\.paymentUrl\)/);
assert.match(card, /saveBookingFormDraft/);
assert.match(card, /saveOpenCheckoutSession/);
assert.match(card, /handleOpenPaymentAgain/);
console.log("OK  QuoteCard opens SumUp in a new tab and preserves draft/checkout session");

const draftStore = read("src/lib/booking-draft-storage.ts");
assert.match(draftStore, /customerName/);
assert.match(draftStore, /customerEmail/);
assert.match(draftStore, /customerMobile/);
assert.match(draftStore, /OPEN_CHECKOUT_KEY/);
console.log("OK  booking draft storage covers contacts + open checkout");

console.log("\nAll SumUp payment UX checks passed.");
