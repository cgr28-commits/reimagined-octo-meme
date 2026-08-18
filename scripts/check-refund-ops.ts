/**
 * Refund / cancellation ops — unit checks for money math, notes rules, emails, and auth gates.
 * Run: npx tsx scripts/check-refund-ops.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANCELLATION_POLICY_VERSION,
  isOperationallyCancelled,
  nextMoneyStatus,
  ownerNotesRequired,
  remainingRefundableBalance,
  resolveRefundAmountForAction,
  roundGbp,
} from "../shared/refund-ops";
import { buildCustomerCancellationEmails } from "../shared/booking-notifications";
import { TERMS_LAST_UPDATED } from "../src/lib/terms";
import { PRIVACY_LAST_UPDATED } from "../src/lib/privacy";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Refund ops money math ===");

assert.equal(remainingRefundableBalance(50, 0), 50);
assert.equal(remainingRefundableBalance(50, 20), 30);
assert.equal(remainingRefundableBalance(50, 50), 0);
assert.equal(remainingRefundableBalance(50, 60), 0);

const full = resolveRefundAmountForAction({
  actionKind: "cancel_full_refund",
  remainingBalance: 42,
  refundFullRemaining: true,
});
assert.equal(full.refundAmount, 42);

const partialAmt = resolveRefundAmountForAction({
  actionKind: "partial_refund_keep_active",
  remainingBalance: 42,
  amount: 10,
  refundFullRemaining: false,
});
assert.equal(partialAmt.refundAmount, 10);

const over = resolveRefundAmountForAction({
  actionKind: "partial_refund_keep_active",
  remainingBalance: 10,
  amount: 15,
  refundFullRemaining: false,
});
assert.ok(over.error);
assert.equal(over.refundAmount, 0);

const zeroPartial = resolveRefundAmountForAction({
  actionKind: "cancel_partial_refund",
  remainingBalance: 40,
  amount: 0,
  refundFullRemaining: false,
});
assert.ok(zeroPartial.error);

const multi1 = remainingRefundableBalance(100, 30);
const multi2 = resolveRefundAmountForAction({
  actionKind: "partial_refund_keep_active",
  remainingBalance: multi1,
  amount: 40,
  refundFullRemaining: false,
});
assert.equal(multi2.refundAmount, 40);
const afterTwo = remainingRefundableBalance(100, 70);
assert.equal(afterTwo, 30);
const multi3 = resolveRefundAmountForAction({
  actionKind: "partial_refund_keep_active",
  remainingBalance: afterTwo,
  amount: 40,
  refundFullRemaining: false,
});
assert.ok(multi3.error, "cannot refund more than remaining");

assert.equal(
  nextMoneyStatus({ cancelBooking: false, amountPaid: 100, amountRefundedAfter: 40 }),
  "partially_refunded",
);
assert.equal(
  nextMoneyStatus({ cancelBooking: false, amountPaid: 100, amountRefundedAfter: 100 }),
  "refunded",
);
assert.equal(
  nextMoneyStatus({ cancelBooking: true, amountPaid: 100, amountRefundedAfter: 0 }),
  "cancelled",
);
assert.equal(
  nextMoneyStatus({ cancelBooking: true, amountPaid: 100, amountRefundedAfter: 100 }),
  "refunded",
);

assert.equal(isOperationallyCancelled("cancelled"), true);
assert.equal(isOperationallyCancelled("refunded"), true);
assert.equal(isOperationallyCancelled("partially_refunded"), false);
assert.equal(isOperationallyCancelled("confirmed"), false);
console.log("OK  money math / status");

console.log("=== Owner notes required ===");
assert.equal(
  ownerNotesRequired({
    reasonCategory: "goodwill",
    refundAmount: 10,
    refundFullRemaining: true,
    within24h: false,
  }),
  true,
);
assert.equal(
  ownerNotesRequired({
    reasonCategory: "other",
    refundAmount: 0,
    refundFullRemaining: false,
    within24h: false,
  }),
  true,
);
assert.equal(
  ownerNotesRequired({
    reasonCategory: "fare_adjustment",
    refundAmount: 5,
    refundFullRemaining: false,
    within24h: false,
  }),
  true,
);
assert.equal(
  ownerNotesRequired({
    reasonCategory: "customer_cancelled_over_24h",
    refundAmount: 50,
    refundFullRemaining: true,
    within24h: true,
  }),
  true,
);
assert.equal(
  ownerNotesRequired({
    reasonCategory: "customer_cancelled_over_24h",
    refundAmount: 50,
    refundFullRemaining: true,
    within24h: false,
  }),
  false,
);
console.log("OK  owner notes rules");

console.log("=== Cancellation emails ===");
const base = {
  customerName: "Alex Test",
  paymentReference: "MAT-1234",
  refundAmount: "£42.00",
  refundAmountValue: 42,
  originalAmount: "£42.00",
  originalAmountValue: 42,
  cumulativeRefunded: "£42.00",
  remainingPaid: "£0.00",
  tripLabel: "BFS → Belfast",
  pickupLabel: "BFS",
  dropoffLabel: "Belfast",
  tripDate: "2099-01-15",
  tripTime: "10:00",
  cancelBooking: true,
  within24h: false,
  reasonCategory: "customer_cancelled_over_24h" as const,
  bookingRemainsActive: false,
  actionKind: "cancel_full_refund" as const,
};

const over24 = buildCustomerCancellationEmails(base);
assert.match(over24.customer!.subject, /Booking Cancelled – Full Refund Issued – MAT-1234/);
assert.match(over24.customer!.text, /more than 24 hours/i);
assert.match(over24.customer!.text, /SumUp/);

const under24 = buildCustomerCancellationEmails({
  ...base,
  refundAmount: "£0",
  refundAmountValue: 0,
  cumulativeRefunded: "£0.00",
  remainingPaid: "£42.00",
  within24h: true,
  reasonCategory: "customer_cancelled_under_24h",
  actionKind: "cancel_no_refund",
});
assert.match(under24.customer!.subject, /Booking Cancellation Confirmed – MAT-1234/);
assert.match(under24.customer!.text, /within 24 hours/i);
assert.match(under24.customer!.text, /statutory consumer rights/i);
assert.doesNotMatch(under24.customer!.text, /waive/i);

const partial = buildCustomerCancellationEmails({
  ...base,
  refundAmount: "£10.00",
  refundAmountValue: 10,
  cumulativeRefunded: "£10.00",
  remainingPaid: "£32.00",
  cancelBooking: false,
  bookingRemainsActive: true,
  reasonCategory: "fare_adjustment",
  customerFacingReason: "Fare adjustment",
  actionKind: "partial_refund_keep_active",
});
assert.match(partial.customer!.subject, /Partial Refund Issued – MAT-1234/);
assert.match(partial.customer!.text, /CONFIRMED/);
assert.match(partial.customer!.text, /Fare adjustment/);

const business = buildCustomerCancellationEmails({
  ...base,
  reasonCategory: "business_cancelled",
  actionKind: "cancel_full_refund",
});
assert.match(business.customer!.subject, /Full Refund Issued/);
assert.match(business.customer!.text, /sorry/i);

// Failed SumUp path must not use success templates from this helper when amount is 0
// and cancel is false — nothing to email as "refund completed".
const noop = buildCustomerCancellationEmails({
  ...base,
  refundAmountValue: 0,
  cancelBooking: false,
  bookingRemainsActive: true,
  reasonCategory: "fare_adjustment",
  actionKind: "partial_refund_keep_active",
});
// cancel_no_refund without cancel may still produce cancel-without-refund or null —
// refundAmountValue 0 + cancel false should not claim money refunded.
if (noop.customer) {
  assert.doesNotMatch(noop.customer.text, /refund has been returned/i);
}
console.log("OK  customer cancellation emails");

console.log("=== Terms / Privacy versioning ===");
assert.equal(TERMS_LAST_UPDATED, "August 2026 v2");
assert.equal(CANCELLATION_POLICY_VERSION, "August 2026 v2");
assert.equal(PRIVACY_LAST_UPDATED, "August 2026 v2");
const terms = read("src/lib/terms.ts");
assert.match(terms, /Vehicle Cleaning and Damage/);
assert.match(terms, /reasonable loss/);
assert.doesNotMatch(terms, /waive.*(statutory|chargeback)/i);
assert.doesNotMatch(terms, /all payments are non-refundable in all circumstances/i);
const privacy = read("src/lib/privacy.ts");
assert.match(privacy, /payment and refund disputes/i);
assert.match(privacy, /not retained indefinitely/i);
assert.match(privacy, /we do not add invasive device fingerprinting solely for chargeback/i);
const consent = read("src/components/BookingTermsConsent.tsx");
assert.match(consent, /Cancellation summary/);
assert.match(consent, /CANCELLATION_POLICY_VERSION/);
console.log("OK  terms / privacy / consent");

console.log("=== Server auth + cancel vs refund split (source) ===");
const handlers = read("workers/addresses/src/refund-handlers.ts");
assert.match(handlers, /verifyConfirmOwnerKey/);
assert.match(handlers, /Re-enter OWNER_ACCESS_KEY/);
assert.match(handlers, /idempotencyKey/);
assert.match(handlers, /refund-lock/);
assert.match(handlers, /cancelBooking/);
assert.match(handlers, /partially_refunded|nextMoneyStatus/);
assert.match(handlers, /No customer refund-completed email was sent/);
assert.match(handlers, /markTrackingJobRefunded/);
// Refund-only must gate calendar cancel
assert.match(handlers, /if \(cancelBooking\)/);
assert.doesNotMatch(handlers, /OWNER_ACCESS_KEY.*=.*["'][A-Za-z0-9]{8,}/);

const api = read("src/lib/refund-api.ts");
assert.match(api, /processBookingRefundOrCancel/);
assert.match(api, /confirmOwnerKey/);
assert.match(api, /idempotencyKey/);

const modal = read("src/components/OwnerCancelRefundModal.tsx");
assert.match(modal, /Cancel booking \+ full refund/);
assert.match(modal, /Partial refund only/);
assert.match(modal, /Re-enter OWNER_ACCESS_KEY/);
assert.match(modal, /Refund £/);

const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /OwnerCancelRefundModal/);
assert.match(panel, /Cancel \/ Refund/);

const evidence = read("src/components/OwnerJourneyEvidenceClient.tsx");
assert.match(evidence, /Export dispute evidence/);
assert.match(evidence, /buildDisputeEvidenceSummary/);
assert.match(evidence, /OWNER NOTES \(internal\)/);

const journey = read("workers/addresses/src/journey-handlers.ts");
assert.match(journey, /termsAcceptedAt/);
assert.match(journey, /cancellationPolicyVersion/);
assert.match(journey, /refundHistory/);
assert.match(journey, /paymentAuthorisationWording/);

assert.ok(roundGbp(10.005) === 10.01 || roundGbp(10.005) === 10);
console.log("OK  source wiring");

console.log("\nAll refund ops checks passed.");
