/**
 * Static readiness checks for the production refund smoke-test plan.
 * Does not call SumUp or issue refunds.
 *
 * Run: npx tsx scripts/check-refund-prod-readiness.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Refund production readiness (code/config) ===");

const wrangler = read("workers/addresses/wrangler.toml");
assert.match(wrangler, /\[\[durable_objects\.bindings\]\]/);
assert.match(wrangler, /name = "REFUND_COORDINATOR"/);
assert.match(wrangler, /class_name = "RefundCoordinator"/);
assert.match(wrangler, /\[\[migrations\]\]/);
assert.match(wrangler, /tag = "v1-refund-coordinator"/);
assert.match(wrangler, /new_sqlite_classes = \["RefundCoordinator"\]/);
console.log("OK  wrangler.toml DO binding + migration");

for (const file of [
  "workers/addresses/wrangler.local.toml",
  "workers/addresses/wrangler.alias.toml",
]) {
  const text = read(file);
  assert.match(text, /REFUND_COORDINATOR/);
  assert.match(text, /RefundCoordinator/);
  assert.match(text, /v1-refund-coordinator|new_sqlite_classes/);
}
console.log("OK  local/alias wrangler DO bindings");

const index = read("workers/addresses/src/index.ts");
assert.match(index, /export \{ RefundCoordinator \}/);
assert.match(index, /REFUND_COORDINATOR/);
assert.match(index, /paid-bookings-refund-diagnostics|handleRefundDiagnosticsRequest/);
console.log("OK  Worker exports RefundCoordinator + diagnostics route");

const handlers = read("workers/addresses/src/refund-handlers.ts");
assert.match(handlers, /verifyConfirmOwnerKey/);
assert.doesNotMatch(handlers, /legacyFullRefund/);
assert.match(handlers, /cancel_no_refund|cancelBooking/);
assert.match(handlers, /partial_refund_keep_active|full_refund_keep_active/);
assert.match(handlers, /refunded_active/);
assert.match(handlers, /refundHistory/);
assert.match(handlers, /operationState: \"processor_accepted\"/);
assert.match(handlers, /REFUND FAILED/);
assert.match(handlers, /handleRefundDiagnosticsRequest/);
assert.match(handlers, /coordinatorConfigured/);
assert.doesNotMatch(handlers, /OWNER_ACCESS_KEY.*diagnostics|diagnostics.*OWNER_ACCESS_KEY\s*:/);
console.log("OK  refund handlers: re-auth, partials, cancel-only, keep-active, audit, diagnostics");

const coordinator = read("workers/addresses/src/refund-coordinator.ts");
assert.match(coordinator, /reserveOperation/);
assert.match(coordinator, /onProcessorAccepted/);
assert.doesNotMatch(
  coordinator,
  /blockConcurrencyWhile\(async \(\) =>\s*processBookingRefundOrCancel/,
);
console.log("OK  DO short-lock coordinator pattern");

const modal = read("src/components/OwnerCancelRefundModal.tsx");
assert.match(modal, /confirmOwnerKey/);
assert.match(modal, /finalConfirm/);
assert.match(modal, /Cancel booking without refund/);
assert.match(modal, /Partial refund only/);
assert.match(modal, /idempotencyKey/);
assert.match(modal, /data-owner-refund-submit="true"/);
assert.match(modal, /data-refund-owner-notes="true"/);
assert.match(modal, /Use remaining balance/);
assert.match(modal, /Processing refund/);
console.log("OK  owner modal: re-key, notes, amount before key, single submit");

const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /Refund diagnostics \(read-only\)/);
assert.match(panel, /fetchRefundDiagnostics/);
assert.match(panel, /RefundDiagnosticView/);
console.log("OK  owner panel refund diagnostics UI");

const emails = read("shared/booking-notifications.ts");
assert.match(emails, /has NOT been cancelled|remains booked as scheduled/i);
assert.match(emails, /Partial Refund|partial refund/i);
assert.match(emails, /REFUND_FUNDS_TIMING|5–7 working days/);
assert.doesNotMatch(emails, /Banks\/cards may take several working days/);
console.log("OK  customer emails cover keep-active + partial");

const ops = read("shared/refund-ops.ts");
assert.match(ops, /refunded_active/);
assert.match(ops, /remainingRefundableBalance/);
console.log("OK  refunded_active status model");

console.log("\nAll refund production readiness checks passed.");
console.log(
  "\nManual GO/NO-GO before first £1 refund is documented in the PR body — do not auto-refund.",
);
