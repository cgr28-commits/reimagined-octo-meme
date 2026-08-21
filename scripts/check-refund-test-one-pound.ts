/**
 * Static + unit checks for the owner £1 live SumUp refund test facility.
 * Run: npx tsx scripts/check-refund-test-one-pound.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canSubmitRefundTest,
  parseRefundTestAmountInput,
  remainingBalanceFillValue,
} from "../src/lib/refund-test-ui";

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
assert.match(handlers, /ensureRefundTestIsolationTrackingPair/);
assert.match(handlers, /isRefundTestEnsureTrackingPath/);
assert.doesNotMatch(handlers, /amount:\s*Number\(body\.amount\)/);
console.log("OK  server hard-codes £1; reuses SumUp + refund handler; guards normal bookings");
console.log("OK  optional isolation tracking attach is owner/isRefundTest only");

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
assert.match(refundHandlers, /syncPaidBookingRefundTotalsFromSumUp/);
assert.match(refundHandlers, /applyProcessorAuthoritativeRefund/);
console.log("OK  refund path guards + suppress customer emails on test records");

assert.match(handlers, /syncPaidBookingRefundTotalsFromSumUp/);
console.log("OK  refund-test list syncs SumUp totals before showing remaining");

const store = read("workers/addresses/src/paid-booking-store.ts");
assert.match(store, /listRefundTestPaidBookings/);
assert.match(store, /isOwnerOperationalTestBooking/);
console.log("OK  test bookings excluded from normal upcoming/recent lists");

const upcoming = read("shared/upcoming-jobs.ts");
assert.match(upcoming, /isOwnerOperationalTestBooking/);
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

console.log("=== Refund Test UI safety (single submit) ===");

{
  assert.equal(parseRefundTestAmountInput("", 0.5), null, "blank amount → invalid");
  assert.equal(parseRefundTestAmountInput("   ", 0.5), null, "whitespace amount → invalid");
  assert.equal(parseRefundTestAmountInput("0", 0.5), null, "£0 → invalid");
  assert.equal(parseRefundTestAmountInput("0.00", 0.5), null, "£0.00 → invalid");
  assert.equal(parseRefundTestAmountInput("-1", 0.5), null, "negative → invalid");
  assert.equal(parseRefundTestAmountInput("abc", 0.5), null, "NaN → invalid");
  assert.equal(parseRefundTestAmountInput("0.51", 0.5), null, "over remaining → invalid");
  assert.equal(parseRefundTestAmountInput("0.50", 0.5), 0.5, "exact remaining OK");
  assert.equal(parseRefundTestAmountInput("0.25", 0.5), 0.25, "partial OK");
  console.log("OK  blank / £0 / over-remaining cannot parse as submit amount");
}

{
  const fill = remainingBalanceFillValue(0.5);
  assert.equal(fill, "0.50");
  assert.equal(remainingBalanceFillValue(0), "");
  assert.equal(parseRefundTestAmountInput(fill, 0.5), 0.5);
  console.log("OK  Use remaining fills field only (value string, no submit)");
}

{
  const base = {
    amountRaw: "0.50",
    remainingRefundable: 0.5,
    reasonCategory: "partial_refund_agreed" as const,
    ownerNotes: "Agreed 50p test refund",
    confirmOwnerKey: "secret",
    finalConfirm: true,
    busy: false,
  };
  assert.equal(canSubmitRefundTest(base).ok, true);
  assert.equal(canSubmitRefundTest({ ...base, amountRaw: "" }).ok, false);
  assert.equal(canSubmitRefundTest({ ...base, amountRaw: "0" }).ok, false);
  assert.equal(canSubmitRefundTest({ ...base, amountRaw: "1.00" }).ok, false);
  assert.equal(canSubmitRefundTest({ ...base, confirmOwnerKey: "" }).ok, false);
  assert.equal(canSubmitRefundTest({ ...base, finalConfirm: false }).ok, false);
  assert.equal(canSubmitRefundTest({ ...base, busy: true }).ok, false);
  assert.equal(
    canSubmitRefundTest({ ...base, remainingRefundable: 0, amountRaw: "0.50" }).ok,
    false,
  );
  assert.equal(canSubmitRefundTest({ ...base, reasonCategory: "" as never }).ok, false);
  assert.equal(
    canSubmitRefundTest({ ...base, reasonCategory: "other", ownerNotes: "" }).ok,
    false,
  );
  console.log("OK  submit gate requires valid amount + reason + owner key + checkbox; blocks £0/busy/full");
}

const ui = read("src/components/OwnerRefundTestClient.tsx");
assert.match(ui, /LIVE SUMUP TEST — REAL £1 PAYMENT AND REAL REFUND/);
assert.match(ui, /createRefundTestCheckout/);
assert.match(ui, /issueRefundTestRefund/);
assert.match(ui, /fetchRefundDiagnostics/);
assert.match(ui, /Re-enter OWNER_ACCESS_KEY/);
assert.match(ui, /canSubmitRefundTest/);
assert.match(ui, /remainingBalanceFillValue|Use remaining balance/);
assert.match(ui, /data-refund-test-submit="true"/);
assert.match(ui, /data-refund-test-fill-remaining="true"/);
assert.match(ui, /Processing refund/);
assert.match(ui, /Refund successful:/);
assert.match(ui, /Fully refunded|FULLY REFUNDED/i);
assert.match(ui, /You are about to refund/);
assert.match(ui, /resetRefundForm/);

// Exactly one refund submit button marker; no hard-coded second £0.50 submit path.
const submitMarkers = [...ui.matchAll(/data-refund-test-submit="true"/g)];
assert.equal(submitMarkers.length, 1, "exactly one refund submit button");
assert.doesNotMatch(ui, /onClick=\{\(\) => void submitRefund\(booking, 0\.5\)\}/);
assert.doesNotMatch(ui, /onClick=\{\(\) => void submitRefund\(booking, null\)\}/);
assert.doesNotMatch(ui, />\s*Refund remaining\s*</);
assert.doesNotMatch(ui, /Refund £0\.00/);
assert.match(ui, /data-refund-test-fill-remaining="true"/);
assert.match(ui, /remainingBalanceFillValue\(/);
// Fill-remaining must set amount only — never call submitRefund in that handler.
const fillIdx = ui.indexOf('data-refund-test-fill-remaining="true"');
assert.ok(fillIdx > 0);
const fillWindow = ui.slice(Math.max(0, fillIdx - 450), fillIdx + 120);
assert.match(fillWindow, /setRefundAmount\(/);
assert.match(fillWindow, /remainingBalanceFillValue\(/);
assert.doesNotMatch(fillWindow, /submitRefund/);
console.log("OK  single submit button; no hard-coded £0.50 / remaining submit; no £0.00 label");

const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /\/owner\/refund-test\//);
console.log("OK  owner dashboard links to Refund Test (not public nav)");

const record = read("shared/paid-booking-record.ts");
assert.match(record, /isRefundTest\?: boolean/);
console.log("OK  PaidBookingRecord.isRefundTest");

console.log("\nAll £1 refund-test facility checks passed.");
