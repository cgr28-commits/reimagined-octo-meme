/**
 * Refund safety corrections — auth, status separation, DO coordinator, SumUp reconcile.
 * Run: npx tsx scripts/check-refund-ops.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANCELLATION_POLICY_VERSION,
  cappedRefundAmount,
  deriveCombinedStatus,
  isJourneyStillActive,
  isOperationallyCancelled,
  nextBookingStatuses,
  ownerNotesRequired,
  remainingRefundableBalance,
  resolveOperationalStatus,
  resolveRefundAmountForAction,
} from "../shared/refund-ops";
import { buildCustomerCancellationEmails } from "../shared/booking-notifications";
import { parseSumUpRefundedTotal } from "../shared/sumup-checkout";
import { isUpcomingWorkBooking, isCompletedWorkBooking } from "../shared/upcoming-jobs";
import { TERMS_LAST_UPDATED } from "../src/lib/terms";
import { PRIVACY_LAST_UPDATED } from "../src/lib/privacy";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Status separation: refund money ≠ cancel journey ===");
const fullKeep = nextBookingStatuses({
  cancelBooking: false,
  amountPaid: 42,
  amountRefundedAfter: 42,
});
assert.equal(fullKeep.operationalStatus, "confirmed");
assert.equal(fullKeep.paymentStatus, "fully_refunded");
assert.equal(fullKeep.status, "refunded_active");
assert.equal(isOperationallyCancelled(fullKeep.status), false);
assert.equal(isOperationallyCancelled({ status: fullKeep.status, operationalStatus: fullKeep.operationalStatus }), false);
assert.equal(isJourneyStillActive(fullKeep.status), true);

const fullCancel = nextBookingStatuses({
  cancelBooking: true,
  amountPaid: 42,
  amountRefundedAfter: 42,
});
assert.equal(fullCancel.operationalStatus, "cancelled");
assert.equal(fullCancel.paymentStatus, "fully_refunded");
assert.equal(fullCancel.status, "refunded");
assert.equal(isOperationallyCancelled(fullCancel.status), true);

assert.equal(isUpcomingWorkBooking({ status: "refunded_active" }), true);
assert.equal(isUpcomingWorkBooking({ status: "refunded" }), false);
assert.equal(isUpcomingWorkBooking({ status: "cancelled" }), false);
assert.equal(isCompletedWorkBooking({ status: "refunded_active" }), false);
assert.equal(isCompletedWorkBooking({ status: "refunded" }), true);

assert.equal(resolveOperationalStatus({ status: "refunded_active" }), "confirmed");
assert.equal(resolveOperationalStatus({ status: "refunded" }), "cancelled");
assert.equal(
  deriveCombinedStatus("confirmed", "fully_refunded"),
  "refunded_active",
);
console.log("OK  refunded_active stays operationally confirmed");

console.log("=== Money math / reconcile caps ===");
assert.equal(cappedRefundAmount({ requested: 50, amountPaid: 40, alreadyRefunded: 10 }), 30);
assert.equal(cappedRefundAmount({ requested: 5, amountPaid: 40, alreadyRefunded: 10 }), 5);
assert.equal(cappedRefundAmount({ requested: 20, amountPaid: 40, alreadyRefunded: 40 }), 0);

const parsed = parseSumUpRefundedTotal({
  amount: 50,
  status: "SUCCESSFUL",
  refunded_amount: 15,
  transaction_events: [
    { id: 1, event_type: "REFUND", status: "REFUNDED", amount: 10 },
    { id: 2, event_type: "REFUND", status: "REFUNDED", amount: 5 },
  ],
});
assert.equal(parsed.amountRefunded, 15);
console.log("OK  SumUp refund parse / caps");

console.log("=== Auth: no legacy bypass on HTTP refund path ===");
const handlers = read("workers/addresses/src/refund-handlers.ts");
assert.doesNotMatch(handlers, /legacyFullRefund/);
assert.match(handlers, /confirmOwnerKey/);
assert.match(handlers, /verifyConfirmOwnerKey/);
assert.match(handlers, /REFUND_COORDINATOR/);
assert.match(handlers, /cannot safely serialize refunds/);
assert.match(handlers, /processor_accepted/);
assert.match(handlers, /getSumUpTransactionDetails/);
assert.match(handlers, /cappedRefundAmount/);
assert.doesNotMatch(handlers, /refund-lock/);
assert.doesNotMatch(handlers, /booking:refund-lock/);

const coordinator = read("workers/addresses/src/refund-coordinator.ts");
assert.match(coordinator, /blockConcurrencyWhile/);
assert.match(coordinator, /RefundCoordinator/);
assert.match(coordinator, /confirmOwnerKeyVerified/);
assert.match(coordinator, /reserveOperation|activeRefundOp/);
assert.match(coordinator, /onProcessorAccepted/);
assert.doesNotMatch(coordinator, /KV\.get\(lockKey\)|refund-lock/);
assert.doesNotMatch(
  coordinator,
  /blockConcurrencyWhile\(async \(\) =>\s*processBookingRefundOrCancel/,
);

const wrangler = read("workers/addresses/wrangler.toml");
assert.match(wrangler, /REFUND_COORDINATOR/);
assert.match(wrangler, /RefundCoordinator/);
assert.match(wrangler, /new_sqlite_classes|new_classes/);

const index = read("workers/addresses/src/index.ts");
assert.match(index, /export \{ RefundCoordinator \}/);
assert.match(index, /REFUND_COORDINATOR/);

const api = read("src/lib/refund-api.ts");
assert.match(api, /confirmOwnerKey/);
assert.match(api, /processBookingRefundOrCancel/);
// issueBookingRefund must require confirmOwnerKey — not ownerKey alone as money auth
assert.match(api, /confirmOwnerKey: input\.confirmOwnerKey/);

const admin = read("src/app/admin/refund/RefundPageClient.tsx");
assert.match(admin, /confirmOwnerKey/);
assert.match(admin, /Re-enter OWNER_ACCESS_KEY/);
assert.match(admin, /finalConfirm/);
assert.match(admin, /confirmOwnerKey: confirmOwnerKey\.trim\(\)/);

const driver = read("src/app/driver/DriverPageClient.tsx");
assert.match(driver, /confirmOwnerKey: refundConfirmKey/);
assert.match(driver, /refundFinalConfirm/);

console.log("OK  every UI/HTTP refund path requires fresh confirmOwnerKey");

console.log("=== Emails: full refund keep active ===");
const keepActiveEmail = buildCustomerCancellationEmails({
  customerName: "Alex",
  paymentReference: "MAT-99",
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
  cancelBooking: false,
  within24h: false,
  reasonCategory: "fare_adjustment",
  bookingRemainsActive: true,
  actionKind: "full_refund_keep_active",
});
assert.match(keepActiveEmail.customer!.subject, /Full Refund|Booking Remains|remains/i);
assert.match(keepActiveEmail.customer!.text, /has NOT been cancelled/i);
assert.match(keepActiveEmail.customer!.text, /remains booked as scheduled/i);
assert.doesNotMatch(keepActiveEmail.customer!.text, /has been CANCELLED/);
console.log("OK  keep-active full refund email");

console.log("=== Failure window / reconcile design (source) ===");
assert.match(handlers, /operationState: \"processor_accepted\"/);
assert.match(handlers, /authoritativeAlready|amountRefunded/);
assert.match(handlers, /reconciliation_required|isUncertainEntry/);
// Email failure must not flip money success
assert.match(handlers, /warnings\.push/);
assert.match(handlers, /customerEmailStatus/);
console.log("OK  processor_accepted before side effects; reconcile on retry");

console.log("=== Terms / Privacy unchanged good parts ===");
assert.equal(TERMS_LAST_UPDATED, "September 2026 v1");
assert.equal(CANCELLATION_POLICY_VERSION, "September 2026 v1");
assert.equal(PRIVACY_LAST_UPDATED, "September 2026 v1");
assert.match(read("src/lib/terms.ts"), /Vehicle Cleaning and Damage/);
assert.match(read("src/components/OwnerJourneyEvidenceClient.tsx"), /Export dispute evidence/);
assert.match(read("src/components/OwnerCancelRefundModal.tsx"), /Partial refund only/);
assert.match(read("src/components/OwnerCancelRefundModal.tsx"), /confirmOwnerKey/);
console.log("OK  retained features");

// Silence unused import if tree-shaken differently
void remainingRefundableBalance;
void resolveRefundAmountForAction;
void ownerNotesRequired;

console.log("\nAll refund safety checks passed.");
