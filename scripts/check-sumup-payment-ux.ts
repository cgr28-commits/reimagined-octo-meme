/**
 * Payment-started owner notification + SumUp same-tab Hosted Checkout UX checks.
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
assert.match(attempt.body, /Party size: 2 passengers • 2 suitcases/);
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
assert.match(
  workerIndex,
  /attemptSend = await trySendOwnerOperationalEmail/,
);
console.log("OK  payment-started uses trySendOwnerOperationalEmail (no FormSubmit preference)");

console.log("\n=== SumUp Hosted Checkout (server) ===");
const sumup = read("shared/sumup-checkout.ts");
assert.match(sumup, /hosted_checkout:\s*\{[\s\S]*enabled:\s*true/);
assert.match(sumup, /hosted_checkout_url/);
assert.match(sumup, /redirect_url/);
assert.doesNotMatch(sumup, /NEXT_PUBLIC_.*SUMUP|process\.env\.SUMUP/);
console.log("OK  hosted_checkout.enabled + hosted_checkout_url; no public SumUp key in shared module");

console.log("\n=== QuoteCard same-tab SumUp redirect UX ===");
const card = read("src/components/QuoteCard.tsx");
assert.match(card, /window\.location\.assign\(checkout\.paymentUrl\)/);
assert.match(card, /Opening secure payment…/);
assert.match(card, /You’ll be securely redirected to SumUp to complete your payment/);
assert.doesNotMatch(card, /Secure payment will open in a new tab/);
assert.doesNotMatch(card, /window\.open\(checkout\.paymentUrl,\s*"_blank"/);
assert.doesNotMatch(card, /window\.open\(openCheckout\.paymentUrl,\s*"_blank"/);
assert.match(card, /saveBookingFormDraft/);
assert.match(card, /savePendingPayment/);
assert.match(card, /saveOpenCheckoutSession/);
assert.match(card, /Continue to SumUp/);
console.log("OK  QuoteCard same-tab assign; draft + pending payment preserved");

const shortNotice = read("src/app/pay/short-notice/ShortNoticePayClient.tsx");
assert.match(shortNotice, /window\.location\.assign\(checkout\.paymentUrl\)/);
console.log("OK  short-notice pay also uses same-tab assign");

const createPayment = read("src/lib/create-payment.ts");
assert.match(createPayment, /buildPaymentRedirectUrl/);
assert.match(createPayment, /booking-confirmed/);
assert.doesNotMatch(createPayment, /SUMUP_API_KEY|SUMUP_MERCHANT/);
console.log("OK  create-payment has return URL; no SumUp secrets in frontend");

const finalize = read("src/lib/finalize-paid-booking.ts");
assert.match(finalize, /confirmPaidBooking/);
assert.match(finalize, /PAYMENT_CONFIRM_MAX_ATTEMPTS/);
console.log("OK  return flow confirms via server (not client-only paid flag)");

const draftStore = read("src/lib/booking-draft-storage.ts");
assert.match(draftStore, /customerName/);
assert.match(draftStore, /customerEmail/);
assert.match(draftStore, /customerMobile/);
assert.match(draftStore, /OPEN_CHECKOUT_KEY/);
console.log("OK  booking draft storage covers contacts + open checkout");

console.log("\nAll SumUp payment UX checks passed.");
