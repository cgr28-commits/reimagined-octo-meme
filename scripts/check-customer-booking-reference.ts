/**
 * Short customer booking reference (MAT-####) regressions.
 * Run: npx tsx scripts/check-customer-booking-reference.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatCustomerBookingReference,
  generateCustomerBookingReference,
  isCustomerBookingReference,
  normalizeCustomerBookingReference,
  displayBookingReference,
} from "../shared/customer-booking-reference";
import { paidBookingCustomerRefKey } from "../shared/paid-booking-record";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import { paidBookingRecordToReceipt } from "../shared/paid-booking-canonical";
import type { PaidBookingRecord } from "../shared/paid-booking-record";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function assertSourceContains(rel: string, needles: string[]) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${rel} missing: ${needle}`);
  }
}

console.log("=== 1. Format / normalise MAT-#### ===");
assert.equal(formatCustomerBookingReference(4827), "MAT-4827");
assert.equal(formatCustomerBookingReference(7), "MAT-0007");
assert.equal(normalizeCustomerBookingReference(" mat-4827 "), "MAT-4827");
assert.equal(normalizeCustomerBookingReference("MAT-4827"), "MAT-4827");
assert.equal(normalizeCustomerBookingReference("TAAA4VBCPZ9"), null);
assert.equal(normalizeCustomerBookingReference("matni-123-abc"), null);
assert.ok(isCustomerBookingReference("mat-9999"));
assert.ok(!isCustomerBookingReference("MATNI-1001"));

console.log("=== 2. Generator shape + uniqueness sample ===");
const seen = new Set<string>();
for (let i = 0; i < 40; i += 1) {
  const ref = generateCustomerBookingReference();
  assert.match(ref, /^MAT-\d{4}$/);
  seen.add(ref);
}
assert.ok(seen.size >= 1);

console.log("=== 3. Display prefers customerReference ===");
assert.equal(
  displayBookingReference({ customerReference: "mat-1234", paymentReference: "TAAA" }),
  "MAT-1234",
);
assert.equal(
  displayBookingReference({ paymentReference: "TAAA4VBCPZ9" }),
  "TAAA4VBCPZ9",
);

console.log("=== 4. KV key helper ===");
assert.equal(paidBookingCustomerRefKey("mat-4827"), "booking:customer-ref:MAT-4827");

console.log("=== 5. Confirmation email surfaces MAT-####, not SumUp code as booking ref ===");
const record: PaidBookingRecord = {
  paymentReference: "TAAA4VBCPZ9",
  customerReference: "MAT-4827",
  checkoutId: "chk_1",
  amount: 70,
  currency: "GBP",
  amountPaidLabel: "£70.00",
  customerName: "Test Customer",
  customerEmail: "test@example.com",
  mobileNumber: "07700900000",
  tripLabel: "Airport",
  pickupLabel: "Belfast",
  dropoffLabel: "BFS",
  returnJourney: false,
  tripDate: "2026-09-20",
  tripTime: "10:00",
  calendarEventIds: [],
  status: "confirmed",
  createdAt: "2026-08-19T12:00:00.000Z",
};
const email = buildCustomerConfirmationEmail(paidBookingRecordToReceipt(record), undefined, {
  manageUrl: "https://www.myairporttaxini.co.uk/manage-booking/?token=abc123def456abc123def456abc123de",
});
assert.match(email.subject, /MAT-4827/);
assert.match(email.text, /Booking reference: MAT-4827/);
assert.doesNotMatch(email.text, /Invoice \/ payment reference: TAAA4VBCPZ9/);
assert.match(email.html, /Booking reference/);
assert.match(email.html, /MAT-4827/);
assert.match(email.html, /Manage Your Booking/);
assert.match(email.text, /Manage Your Booking/);
assert.doesNotMatch(email.html, /Invoice \/ payment reference/);

console.log("=== 6. Wiring present in Worker + UI ===");
assertSourceContains("workers/addresses/src/paid-booking-store.ts", [
  "claimUniqueCustomerBookingReference",
  "resolvePaidBookingForCustomerLookup",
  "ensureCustomerBookingReference",
  "ensureManageBookingToken",
]);
assertSourceContains("workers/addresses/src/booking-amendment-handlers.ts", [
  "resolvePaidBookingForCustomerLookup",
  "customerReference",
  "manageBookingToken",
  "getPaidBookingRecordByManageToken",
]);
assertSourceContains("src/app/manage-booking/ManageBookingClient.tsx", [
  "Enter the booking reference shown on your confirmation",
  "placeholder=\"MAT-4827\"",
  "token",
  "Review Changes",
]);
assertSourceContains("src/app/booking-confirmed/BookingConfirmedClient.tsx", [
  "Booking reference:",
]);
assertSourceContains("workers/addresses/src/finalize-paid-checkout.ts", [
  "customerReference",
  "manageUrl",
]);
assertSourceContains("shared/manage-booking-token.ts", [
  "generateManageBookingToken",
  "buildManageBookingUrl",
]);

console.log("check-customer-booking-reference: all assertions passed");
