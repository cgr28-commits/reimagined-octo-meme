/**
 * Mark-as-refunded (external / manual SumUp) — books-only reconciliation.
 * Run: npx tsx scripts/check-mark-external-refund.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canMarkExternalRefund,
  EXTERNAL_REFUND_OWNER_NOTES,
  isOperationallyCancelled,
  nextBookingStatuses,
  resolveRefundAmountForAction,
} from "../shared/refund-ops";
import { isCompletedWorkBooking, isUpcomingWorkBooking } from "../shared/upcoming-jobs";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== mark_external_refund action kind + helpers ===");

const remainingBooks = resolveRefundAmountForAction({
  actionKind: "mark_external_refund",
  remainingBalance: 49,
  refundFullRemaining: true,
});
assert.equal(remainingBooks.refundAmount, 49);
assert.equal(remainingBooks.error, undefined);

const closed = nextBookingStatuses({
  cancelBooking: true,
  amountPaid: 49,
  amountRefundedAfter: 49,
});
assert.equal(closed.status, "refunded");
assert.equal(closed.operationalStatus, "cancelled");
assert.equal(closed.paymentStatus, "fully_refunded");
assert.equal(isOperationallyCancelled(closed.status), true);
assert.equal(isUpcomingWorkBooking({ status: "refunded" }), false);
assert.equal(isCompletedWorkBooking({ status: "refunded" }), true);

assert.equal(
  canMarkExternalRefund({
    status: "confirmed",
    amountPaid: 49,
    amountRefunded: 0,
  }),
  true,
);
assert.equal(
  canMarkExternalRefund({
    status: "refunded",
    amountPaid: 49,
    amountRefunded: 49,
  }),
  false,
);
assert.equal(
  canMarkExternalRefund({
    status: "cancelled",
    paymentStatus: "fully_refunded",
    amountPaid: 49,
    amountRefunded: 49,
  }),
  false,
);
assert.equal(
  canMarkExternalRefund({
    status: "refunded_active",
    amountPaid: 49,
    amountRefunded: 49,
  }),
  true,
  "refunded_active still needs operational close",
);
assert.match(EXTERNAL_REFUND_OWNER_NOTES, /manually in SumUp/i);
console.log("OK  status helpers + canMarkExternalRefund");

console.log("=== Worker path never calls SumUp for external mark ===");
const handlers = read("workers/addresses/src/refund-handlers.ts");
assert.match(handlers, /mark_external_refund/);
assert.match(handlers, /processMarkExternalRefund/);
assert.match(handlers, /external_manual_sumup/);
assert.match(handlers, /Never calls SumUp/);
assert.match(handlers, /if \(actionKind === "mark_external_refund"\)/);
assert.match(handlers, /customerEmailSent: false/);
assert.match(handlers, /closeJourney: true/);
const externalFn = handlers.slice(
  handlers.indexOf("async function processMarkExternalRefund"),
  handlers.indexOf("export async function processBookingRefundOrCancel"),
);
assert.ok(externalFn.length > 200, "processMarkExternalRefund body present");
assert.doesNotMatch(externalFn, /refundSumUpTransaction/);
assert.doesNotMatch(externalFn, /reconcileRecordWithSumUp/);
assert.doesNotMatch(externalFn, /getSumUpTransactionDetails/);
console.log("OK  no SumUp refund API on external mark path");

console.log("=== Owner UI confirmation copy ===");
const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /Mark as refunded/);
assert.match(panel, /Has this customer already been refunded manually in SumUp\?/);
assert.match(panel, /Yes — close as refunded/);
assert.match(panel, /markBookingRefundedExternally/);

const driver = read("src/app/driver/DriverPageClient.tsx");
assert.match(driver, /Mark as refunded/);
assert.match(driver, /Has this customer already been refunded manually in SumUp\?/);
assert.match(driver, /Yes — close as refunded/);

const api = read("src/lib/refund-api.ts");
assert.match(api, /markBookingRefundedExternally/);
assert.match(api, /mark_external_refund/);
assert.match(api, /Does not call SumUp/);
console.log("OK  Owner + job-card UI + API helper");

console.log("\nAll mark-external-refund checks passed.");
