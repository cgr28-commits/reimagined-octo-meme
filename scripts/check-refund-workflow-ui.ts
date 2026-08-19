/**
 * Refund workflow UI / audit / customer email checks.
 * Run: npx tsx scripts/check-refund-workflow-ui.ts
 *
 * Does NOT weaken SumUp refund API / REFUND_COORDINATOR / reconciliation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFUND_FUNDS_TIMING,
  REFUND_REASON_LABELS,
  canSubmitOwnerRefundForm,
  ownerNotesRequired,
} from "../shared/refund-ops";
import {
  buildCustomerCancellationEmails,
  type CancellationEmailDetails,
} from "../shared/booking-notifications";
import {
  canSubmitRefundTest,
  parseRefundTestAmountInput,
  refundFormFieldsEditableWithoutOwnerKey,
} from "../src/lib/refund-test-ui";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const baseDetails = (): CancellationEmailDetails => ({
  customerName: "Alex Test",
  paymentReference: "REF-123",
  refundAmount: "£0.50",
  refundAmountValue: 0.5,
  originalAmount: "£1.00",
  originalAmountValue: 1,
  cumulativeRefunded: "£0.50",
  remainingPaid: "£0.50",
  tripLabel: "Airport transfer",
  pickupLabel: "Home",
  dropoffLabel: "BFS",
  tripDate: "2026-09-01",
  tripTime: "10:00",
  cancelBooking: false,
  within24h: false,
  reasonCategory: "partial_refund_agreed",
  bookingRemainsActive: true,
  actionKind: "partial_refund_keep_active",
  ownerNotes: "SECRET_OWNER_NOTE_SHOULD_NEVER_EMAIL_CUSTOMER",
  auditId: "audit-abc",
  sumUpTransactionId: "txn-xyz",
});

console.log("=== Form order / gates (amount before owner key) ===");

assert.equal(refundFormFieldsEditableWithoutOwnerKey(), true);

{
  const amountOk = parseRefundTestAmountInput("0.50", 1);
  assert.equal(amountOk, 0.5);
  // Amount/reason/notes can be set without owner key — submit still blocked.
  const withoutKey = canSubmitRefundTest({
    amountRaw: "0.50",
    remainingRefundable: 1,
    reasonCategory: "partial_refund_agreed",
    ownerNotes: "Agreed 50p test",
    confirmOwnerKey: "",
    finalConfirm: true,
    busy: false,
  });
  assert.equal(withoutKey.ok, false);
  assert.equal(withoutKey.reason, "missing_owner_key");
  assert.equal(withoutKey.amount, 0.5, "amount parsed before owner key");

  const withoutConfirm = canSubmitRefundTest({
    amountRaw: "0.50",
    remainingRefundable: 1,
    reasonCategory: "fare_adjustment",
    ownerNotes: "Fare adjustment notes",
    confirmOwnerKey: "secret",
    finalConfirm: false,
    busy: false,
  });
  assert.equal(withoutConfirm.ok, false);
  assert.equal(withoutConfirm.reason, "missing_confirm");

  const withoutReason = canSubmitRefundTest({
    amountRaw: "0.50",
    remainingRefundable: 1,
    reasonCategory: "",
    ownerNotes: "notes",
    confirmOwnerKey: "secret",
    finalConfirm: true,
    busy: false,
  });
  assert.equal(withoutReason.ok, false);
  assert.equal(withoutReason.reason, "missing_reason");

  const otherNeedsNotes = canSubmitRefundTest({
    amountRaw: "0.50",
    remainingRefundable: 1,
    reasonCategory: "other",
    ownerNotes: "",
    confirmOwnerKey: "secret",
    finalConfirm: true,
    busy: false,
  });
  assert.equal(otherNeedsNotes.ok, false);
  assert.equal(otherNeedsNotes.reason, "notes_required");

  assert.equal(parseRefundTestAmountInput("", 1), null);
  assert.equal(parseRefundTestAmountInput("0", 1), null);
  assert.equal(parseRefundTestAmountInput("-1", 1), null);
  assert.equal(parseRefundTestAmountInput("2", 1), null);

  const ok = canSubmitRefundTest({
    amountRaw: "0.50",
    remainingRefundable: 1,
    reasonCategory: "partial_refund_agreed",
    ownerNotes: "Agreed with customer",
    confirmOwnerKey: "secret",
    finalConfirm: true,
    busy: false,
  });
  assert.equal(ok.ok, true);
  console.log("OK  amount/reason/notes before key; submit needs key+confirm+reason; Other needs notes");
}

{
  const ownerGate = canSubmitOwnerRefundForm({
    busy: false,
    moneyMoveRequired: true,
    refundAmount: 0.5,
    remainingRefundable: 1,
    reasonCategory: "fare_adjustment",
    ownerNotes: "",
    confirmOwnerKey: "",
    finalConfirm: false,
    refundFullRemaining: false,
    within24h: false,
  });
  assert.equal(ownerGate.ok, false);
  assert.ok(
    ownerGate.reason === "missing_owner_key" ||
      ownerGate.reason === "missing_confirm" ||
      ownerGate.reason === "notes_required",
  );
  assert.equal(
    ownerNotesRequired({
      reasonCategory: "other",
      refundAmount: 1,
      refundFullRemaining: true,
      within24h: false,
    }),
    true,
  );
  console.log("OK  production form gate helpers");
}

console.log("=== UI single-submit + field order markers ===");
{
  const modal = read("src/components/OwnerCancelRefundModal.tsx");
  assert.match(modal, /data-owner-refund-form="ordered"/);
  assert.match(modal, /data-owner-refund-submit="true"/);
  assert.match(modal, /data-refund-amount-input="true"/);
  assert.match(modal, /data-refund-reason="true"/);
  assert.match(modal, /data-refund-owner-notes="true"/);
  assert.match(modal, /data-refund-owner-key="true"/);
  assert.match(modal, /data-fully-refunded="true"/);
  assert.match(modal, /Use remaining balance/);
  assert.match(modal, /Fills the Amount field only/);
  assert.match(modal, /Processing refund/);
  // Owner key appears after notes in source order.
  const notesIdx = modal.indexOf("data-refund-owner-notes");
  const keyIdx = modal.indexOf("data-refund-owner-key");
  const amountIdx = modal.indexOf("data-refund-amount-input");
  const reasonIdx = modal.indexOf("data-refund-reason");
  assert.ok(amountIdx > 0 && reasonIdx > amountIdx, "amount before reason");
  assert.ok(notesIdx > reasonIdx, "reason before notes");
  assert.ok(keyIdx > notesIdx, "notes before owner key");
  const submits = [...modal.matchAll(/data-owner-refund-submit="true"/g)];
  assert.equal(submits.length, 1, "exactly one owner refund submit button");
  console.log("OK  production modal field order + single submit");
}

{
  const testUi = read("src/components/OwnerRefundTestClient.tsx");
  assert.match(testUi, /data-refund-test-submit="true"/);
  assert.match(testUi, /data-refund-test-amount="true"/);
  assert.match(testUi, /data-refund-test-reason="true"/);
  assert.match(testUi, /data-refund-test-notes="true"/);
  assert.match(testUi, /Processing refund/);
  const submits = [...testUi.matchAll(/data-refund-test-submit="true"/g)];
  assert.equal(submits.length, 1);
  console.log("OK  refund-test single submit + reason/notes");
}

console.log("=== Customer email wording ===");
{
  const partial = buildCustomerCancellationEmails(baseDetails());
  assert.ok(partial.customer);
  assert.match(partial.customer!.text, /partial refund of £0\.50/i);
  assert.match(partial.customer!.text, /remains booked as scheduled/i);
  assert.ok(partial.customer!.text.includes(REFUND_FUNDS_TIMING));
  assert.doesNotMatch(partial.customer!.text, /SECRET_OWNER_NOTE/);
  assert.doesNotMatch(partial.customer!.html, /SECRET_OWNER_NOTE/);
  assert.match(partial.owner!.body, /SECRET_OWNER_NOTE/);
  assert.match(partial.owner!.body, /audit-abc|Audit/i);
  console.log("OK  partial refund email + owner notes only on owner");
}

{
  const fullActive = buildCustomerCancellationEmails({
    ...baseDetails(),
    refundAmount: "£1.00",
    refundAmountValue: 1,
    cumulativeRefunded: "£1.00",
    remainingPaid: "£0.00",
    cancelBooking: false,
    bookingRemainsActive: true,
    actionKind: "full_refund_keep_active",
    reasonCategory: "goodwill",
  });
  assert.ok(fullActive.customer);
  assert.match(fullActive.customer!.text, /full refund of £1\.00/i);
  assert.match(fullActive.customer!.text, /has NOT been cancelled/i);
  assert.match(fullActive.customer!.text, /remains booked as scheduled/i);
  assert.ok(fullActive.customer!.text.includes(REFUND_FUNDS_TIMING));
  assert.doesNotMatch(fullActive.customer!.text, /SECRET_OWNER_NOTE/);
  console.log("OK  full-refund-but-booking-active wording");
}

{
  const cancelled = buildCustomerCancellationEmails({
    ...baseDetails(),
    refundAmount: "£1.00",
    refundAmountValue: 1,
    cumulativeRefunded: "£1.00",
    remainingPaid: "£0.00",
    cancelBooking: true,
    bookingRemainsActive: false,
    actionKind: "cancel_full_refund",
    reasonCategory: "customer_cancelled_over_24h",
    within24h: false,
  });
  assert.ok(cancelled.customer);
  assert.match(cancelled.customer!.text, /booking has been cancelled/i);
  assert.match(cancelled.customer!.text, /refund of £1\.00/i);
  assert.ok(cancelled.customer!.text.includes(REFUND_FUNDS_TIMING));
  assert.doesNotMatch(cancelled.customer!.text, /remains booked as scheduled/);
  assert.doesNotMatch(cancelled.customer!.text, /SECRET_OWNER_NOTE/);
  console.log("OK  cancelled-and-refunded wording");
}

{
  const notifications = read("shared/booking-notifications.ts");
  assert.doesNotMatch(notifications, /Banks\/cards may take several working days/);
  assert.doesNotMatch(notifications, /bank or card provider may take several working days/);
  assert.match(notifications, /REFUND_FUNDS_TIMING/);
  assert.match(notifications, /buildOwnerRefundAuditEmailBody/);
  assert.match(notifications, /has NOT been cancelled/);
  // owner notes must not be interpolated into customer templates via ownerNotes variable misuse
  assert.match(notifications, /never included in customer|NEVER|must never/i);
  console.log("OK  all refund emails use 5–7 working days; no banks/cards wording");
}

console.log("=== Reason labels + audit fields ===");
{
  assert.match(
    REFUND_REASON_LABELS.customer_cancelled_over_24h,
    /more than 24 hours/i,
  );
  assert.match(REFUND_REASON_LABELS.business_cancelled, /Owner\/service/i);
  assert.match(REFUND_REASON_LABELS.partial_refund_agreed, /Partial refund agreed/i);
  const ops = read("shared/refund-ops.ts");
  assert.match(ops, /partial_refund_agreed/);
  assert.match(ops, /amountRetained/);
  assert.match(ops, /ownerNotesAt/);
  assert.match(ops, /initiatedBy/);
  assert.match(ops, /within24HoursOfPickup/);
  assert.match(ops, /bookingStatusAfter/);
  assert.match(ops, /REFUND_FUNDS_TIMING/);
  console.log("OK  reason labels + audit trail fields");
}

console.log("=== Backend SumUp path not weakened ===");
{
  const handlers = read("workers/addresses/src/refund-handlers.ts");
  assert.match(handlers, /applyProcessorAuthoritativeRefund/);
  assert.match(handlers, /reconcileRecordWithSumUp|syncPaidBookingRefundTotalsFromSumUp/);
  assert.match(handlers, /verifyConfirmOwnerKey/);
  assert.match(handlers, /REFUND_COORDINATOR|onProcessorAccepted/);
  assert.match(handlers, /ownerNotesAt/);
  assert.match(handlers, /amountRetained/);
  assert.doesNotMatch(handlers, /confirmOwnerKeyVerified:\s*false/);
  const sumup = read("shared/sumup-checkout.ts");
  assert.match(sumup, /v0\.1\/me\/refund/);
  assert.match(sumup, /buildSumUpRefundHttpBody/);
  console.log("OK  SumUp refund/reconciliation + owner key validation intact");
}

console.log("\nAll refund workflow UI / audit / email checks passed.");
