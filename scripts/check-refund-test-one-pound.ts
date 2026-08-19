/**
 * Static checks for the owner-only £1 live SumUp refund test facility.
 * Run: npx tsx scripts/check-refund-test-one-pound.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Owner £1 live SumUp refund test facility ===");

const handlers = read("workers/addresses/src/refund-test-handlers.ts");
assert.match(handlers, /REFUND_TEST_AMOUNT_GBP = 1/);
assert.match(handlers, /REFUND-TEST-/);
assert.match(handlers, /isRefundTest: true/);
assert.match(handlers, /createSumUpHostedCheckout/);
assert.match(handlers, /handleRefundRequest/);
assert.match(handlers, /refundTest: true/);
assert.match(handlers, /cannot refund a normal customer booking/i);
assert.match(handlers, /ownerAuthorized/);
assert.doesNotMatch(handlers, /amount:\s*Number\(body\.amount\)/);
console.log("OK  server hard-codes £1; reuses SumUp + refund handler; guards normal bookings");

const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
assert.match(finalize, /isRefundTest/);
assert.match(finalize, /REFUND TEST £1 PAID/);
assert.match(finalize, /No customer journey/);
console.log("OK  finalize skips journey/calendar/customer emails for refund tests");

const refundHandlers = read("workers/addresses/src/refund-handlers.ts");
assert.match(refundHandlers, /refundTestRequested/);
assert.match(refundHandlers, /isRefundTest/);
assert.match(refundHandlers, /suppressCustomerEmails|Refund test — customer/);
assert.match(refundHandlers, /isRefundTest: true/);
console.log("OK  refund path guards + suppress customer emails on test records");

const store = read("workers/addresses/src/paid-booking-store.ts");
assert.match(store, /listRefundTestPaidBookings/);
assert.match(store, /!record\.isRefundTest/);
console.log("OK  test bookings excluded from normal upcoming/recent lists");

const upcoming = read("shared/upcoming-jobs.ts");
assert.match(upcoming, /isRefundTest/);
console.log("OK  Upcoming Jobs filter excludes isRefundTest");

const index = read("workers/addresses/src/index.ts");
assert.match(index, /paid-bookings-refund-test-checkout/);
assert.match(index, /handleRefundTestCheckoutRequest/);
console.log("OK  Worker routes wired");

const page = read("src/app/owner/refund-test/page.tsx");
assert.match(page, /OwnerRefundTestClient/);
assert.match(page, /robots/);
console.log("OK  owner refund-test page present");

const ui = read("src/components/OwnerRefundTestClient.tsx");
assert.match(ui, /LIVE SUMUP TEST — REAL £1 PAYMENT AND REAL REFUND/);
assert.match(ui, /createRefundTestCheckout/);
assert.match(ui, /issueRefundTestRefund/);
assert.match(ui, /fetchRefundDiagnostics/);
assert.match(ui, /Re-enter OWNER_ACCESS_KEY/);
assert.match(ui, /Refund £0\.50/);
console.log("OK  owner UI warnings + re-auth + diagnostics + £0.50 refund");

const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /\/owner\/refund-test\//);
console.log("OK  owner dashboard links to Refund Test (not public nav)");

const record = read("shared/paid-booking-record.ts");
assert.match(record, /isRefundTest\?: boolean/);
console.log("OK  PaidBookingRecord.isRefundTest");

console.log("\nAll £1 refund-test facility checks passed.");
