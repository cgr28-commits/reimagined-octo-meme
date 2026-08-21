/**
 * Mobile WhatsApp in Header quick row (not floating); external refund supersedes stale DO lock.
 * Run: npx tsx scripts/check-whatsapp-row-external-refund.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOwnerFinancialSummary,
  type OwnerFinancialBookingInput,
} from "../shared/owner-financial-summary";
import { EXTERNAL_REFUND_OWNER_NOTES } from "../shared/refund-ops";
import type { RefundAuditEntry } from "../shared/refund-ops";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Mobile WhatsApp in shortcut row (no floating FAB) ===");
{
  const header = read("src/components/Header.tsx");
  const layout = read("src/app/layout.tsx");
  const wa = read("src/components/WhatsAppButton.tsx");
  const assistant = read("src/components/QuoteAssistant.tsx");
  const hero = read("src/components/HeroSlideshow.tsx");

  assert.match(header, /data-matni-whatsapp-quick/);
  assert.match(header, /Get a Quote/);
  assert.match(header, /h-7 w-7/);
  assert.match(header, /#25D366/);
  assert.match(header, /Hi, I need some help with an airport transfer/);
  assert.match(header, /items-center/);
  assert.doesNotMatch(header, /data-matni-whatsapp-fab/);
  // Icon-only — no WhatsApp text on the quick-row control.
  const quickIdx = header.indexOf("data-matni-whatsapp-quick");
  const quickSlice = header.slice(quickIdx, quickIdx + 800);
  assert.doesNotMatch(quickSlice, />\s*WhatsApp\s*</);

  assert.doesNotMatch(layout, /<WhatsAppButton/);
  assert.match(wa, /return null/);
  assert.doesNotMatch(wa, /createPortal/);
  assert.doesNotMatch(wa, /position:\s*"fixed"/);
  assert.doesNotMatch(wa, /fixed z-\[60\]/);

  // Desktop help unchanged.
  assert.match(assistant, /data-matni-help-launcher/);
  assert.match(assistant, /isMobile !== false/);
  // Live Quote untouched.
  assert.match(hero, /id="quote"/);
  assert.match(hero, /<QuoteCard/);
  assert.doesNotMatch(hero, /data-matni-whatsapp/);
  console.log("OK  WhatsApp beside Get a Quote · no floating FAB · desktop ? kept");
}

console.log("=== External mark supersedes stale refund-operation lock ===");
{
  const coordinator = read("workers/addresses/src/refund-coordinator.ts");
  assert.match(coordinator, /mark_external_refund/);
  assert.match(coordinator, /supersede/);
  assert.match(coordinator, /isExternalMark/);
  // Normal SumUp refunds still blocked when busy.
  assert.match(coordinator, /Normal SumUp refunds stay blocked/);
  assert.match(coordinator, /Another refund operation is already in progress/);

  const handlers = read("workers/addresses/src/refund-handlers.ts");
  assert.match(handlers, /processMarkExternalRefund/);
  assert.match(handlers, /Never calls SumUp/);
  assert.match(handlers, /external_manual_sumup/);
  assert.match(handlers, /EXTERNAL_REFUND_OWNER_NOTES/);
  assert.doesNotMatch(
    handlers.slice(
      handlers.indexOf("async function processMarkExternalRefund"),
      handlers.indexOf("export async function processBookingRefundOrCancel"),
    ),
    /refundSumUpTransaction/,
  );
  // Idempotent across keys when already externally closed.
  assert.match(handlers, /priorExternal/);
  assert.match(handlers, /alreadyProcessed: true/);

  const sharedNotes = read("shared/refund-ops.ts");
  assert.match(sharedNotes, /Manually confirmed refunded by Owner/);
  assert.match(sharedNotes, /no SumUp API refund issued/i);
  console.log("OK  stale lock supersede · no SumUp API · idempotent");
}

console.log("=== Confirmation copy + audit note ===");
{
  assert.match(EXTERNAL_REFUND_OWNER_NOTES, /Manually confirmed refunded by Owner/);
  assert.match(EXTERNAL_REFUND_OWNER_NOTES, /no SumUp API refund issued/i);

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Only use this if you have already refunded the customer outside this website/);
  assert.match(panel, /This will NOT send money/);
  assert.match(panel, /Yes — close as refunded/);

  const driver = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driver, /Only use this if you have already refunded the customer outside this website/);
  console.log("OK  owner confirmation + audit wording");
}

console.log("=== Financial totals: external refund counted once · full refund £0 net ===");
{
  function audit(partial: Partial<RefundAuditEntry> & { refundAmount: number; completedAt: string }): RefundAuditEntry {
    return {
      id: partial.id ?? `op-${partial.completedAt}`,
      bookingReference: partial.bookingReference ?? "REF",
      originalAmountPaid: 49,
      refundAmount: partial.refundAmount,
      cumulativeRefundedAmount: partial.cumulativeRefundedAmount ?? partial.refundAmount,
      remainingBalance: 0,
      currency: "GBP",
      fullOrPartial: "full",
      cancelBooking: true,
      reasonCategory: "other",
      ownerNotes: EXTERNAL_REFUND_OWNER_NOTES,
      requestedAt: partial.completedAt,
      completedAt: partial.completedAt,
      success: true,
      customerEmailStatus: "skipped",
      ownerEmailStatus: "skipped",
      idempotencyKey: partial.idempotencyKey ?? `id-${partial.completedAt}`,
      actionKind: "mark_external_refund",
      operationState: "completed",
      sumUpStatus: "external_manual_sumup",
    };
  }

  const richard: OwnerFinancialBookingInput = {
    paymentReference: "PAY-RICHARD",
    createdAt: "2026-08-18T10:00:00Z",
    amountPaidLabel: "£49.00",
    originalAmount: 49,
    amount: 49,
    amountRefunded: 49,
    status: "refunded",
    paymentStatus: "fully_refunded",
    customerName: "Richard Chambers",
    refundedAt: "2026-08-19T15:00:00Z",
    tripDate: "2026-08-25",
    refundHistory: [
      audit({ refundAmount: 49, completedAt: "2026-08-19T15:00:00Z" }),
    ],
  };

  // Duplicate accidental second close must not exist — simulate only one audit.
  const summary = buildOwnerFinancialSummary([richard], new Date("2026-08-19T16:00:00Z"));
  assert.equal(summary.week.total, 0, "fully refunded → £0 net this week");
  assert.equal(summary.week.count, 1);
  assert.equal(summary.refunds.total, 49);
  assert.equal(summary.refunds.count, 1, "refund counted once");

  // If books already fully refunded and a £0 closeout audit exists, still once.
  const alreadyBooked: OwnerFinancialBookingInput = {
    ...richard,
    paymentReference: "PAY-ALREADY",
    refundHistory: [
      {
        ...audit({ refundAmount: 49, completedAt: "2026-08-12T10:00:00Z", actionKind: "cancel_full_refund" as never }),
        actionKind: "cancel_full_refund",
        sumUpStatus: "accepted",
      },
      audit({
        refundAmount: 0,
        completedAt: "2026-08-19T16:00:00Z",
        idempotencyKey: "external-close-only",
      }),
    ],
  };
  const summary2 = buildOwnerFinancialSummary(
    [alreadyBooked],
    new Date("2026-08-19T17:00:00Z"),
  );
  assert.equal(summary2.refunds.total, 49);
  assert.equal(summary2.refunds.count, 1, "£0 external closeout does not double-count");
  console.log("OK  Richard-style external refund once · £0 net");
}

console.log("=== Normal Issue Refund still protected ===");
{
  const coordinator = read("workers/addresses/src/refund-coordinator.ts");
  assert.match(coordinator, /if \(inFlight && !isExternalMark\)/);
  assert.match(coordinator, /return \{ kind: "busy"/);
  const checks = read("scripts/check-sumup-refund-reconcile.ts");
  assert.match(checks, /Another refund operation is already in progress/);
  console.log("OK  normal SumUp refund busy lock intact");
}

console.log("\nAll whatsapp-row + external-refund checks passed.");
