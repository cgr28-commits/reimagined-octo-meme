/**
 * SumUp refund reconciliation fixtures + Durable Object coordinator checks.
 * Run: npx tsx scripts/check-sumup-refund-reconcile.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSumUpRefundedTotal,
  type SumUpTransactionPayload,
} from "../shared/sumup-checkout";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

/** Fixtures resembling documented SumUp retrieve-transaction responses. */
const FIXTURES = {
  noRefund: {
    id: "tx-1",
    amount: 50,
    currency: "GBP",
    status: "SUCCESSFUL",
    refunded_amount: 0,
    transaction_events: [
      { id: 1, event_type: "PAYOUT", status: "PAID_OUT", amount: 50 },
    ],
  } satisfies SumUpTransactionPayload,

  onePartial: {
    id: "tx-2",
    amount: 50,
    currency: "GBP",
    status: "SUCCESSFUL",
    refunded_amount: 10,
    transaction_events: [
      { id: 10, event_type: "REFUND", status: "REFUNDED", amount: 10 },
      { id: 11, event_type: "PAYOUT", status: "PAID_OUT", amount: 40 },
    ],
  } satisfies SumUpTransactionPayload,

  multiplePartials: {
    id: "tx-3",
    amount: 50,
    currency: "GBP",
    status: "SUCCESSFUL",
    refunded_amount: 35,
    transaction_events: [
      { id: 20, event_type: "REFUND", status: "REFUNDED", amount: 10 },
      { id: 21, event_type: "REFUND", status: "SUCCESSFUL", amount: 25 },
    ],
  } satisfies SumUpTransactionPayload,

  fullRefund: {
    id: "tx-4",
    amount: 42,
    currency: "GBP",
    status: "REFUNDED",
    refunded_amount: 42,
    transaction_events: [
      { id: 30, event_type: "REFUND", status: "REFUNDED", amount: 42 },
    ],
  } satisfies SumUpTransactionPayload,

  failedRefundEvent: {
    id: "tx-5",
    amount: 50,
    currency: "GBP",
    status: "SUCCESSFUL",
    refunded_amount: 0,
    transaction_events: [
      { id: 40, event_type: "REFUND", status: "FAILED", amount: 20 },
      { id: 41, event_type: "REFUND", status: "PENDING", amount: 15 },
    ],
  } satisfies SumUpTransactionPayload,

  /** Same refund id appears once in transaction_events; compact events also present — must not double-count. */
  duplicateRepresentations: {
    id: "tx-6",
    amount: 50,
    currency: "GBP",
    status: "SUCCESSFUL",
    // No refunded_amount — force event summing path
    transaction_events: [
      { id: 50, event_type: "REFUND", status: "REFUNDED", amount: 12 },
      { id: 50, event_type: "REFUND", status: "REFUNDED", amount: 12 }, // duplicate id
    ],
    events: [
      { id: 50, event_type: "REFUND", status: "REFUNDED", amount: 12 },
    ],
  } satisfies SumUpTransactionPayload,

  /** Compact events only (no transaction_events). */
  compactEventsOnly: {
    id: "tx-7",
    amount: 50,
    currency: "GBP",
    status: "SUCCESSFUL",
    events: [
      { id: 60, event_type: "REFUND", status: "REFUNDED", amount: 8 },
      { id: 61, event_type: "CHARGE_BACK", status: "SUCCESSFUL", amount: 8 },
      { id: 62, event_type: "PAYOUT_DEDUCTION", status: "SUCCESSFUL", amount: 8 },
    ],
  } satisfies SumUpTransactionPayload,

  statusFullOnly: {
    id: "tx-8",
    amount: 30,
    currency: "GBP",
    status: "REFUNDED",
  } satisfies SumUpTransactionPayload,

  /** refunded_amount wins over event sum (events incomplete). */
  refundedAmountAuthoritative: {
    id: "tx-9",
    amount: 100,
    currency: "GBP",
    status: "SUCCESSFUL",
    refunded_amount: 40,
    transaction_events: [
      { id: 70, event_type: "REFUND", status: "REFUNDED", amount: 10 },
    ],
  } satisfies SumUpTransactionPayload,

  /** Multiple partials via transaction_events only (no refunded_amount). */
  multiplePartialsEventsOnly: {
    id: "tx-10",
    amount: 80,
    currency: "GBP",
    status: "SUCCESSFUL",
    transaction_events: [
      { id: 80, event_type: "REFUND", status: "REFUNDED", amount: 15 },
      { id: 81, event_type: "REFUND", status: "SUCCESSFUL", amount: 20 },
      { id: 82, event_type: "REFUND", status: "FAILED", amount: 5 },
    ],
  } satisfies SumUpTransactionPayload,
} as const;

console.log("=== SumUp parseSumUpRefundedTotal fixtures ===");

{
  const r = parseSumUpRefundedTotal(FIXTURES.noRefund);
  assert.equal(r.amountRefunded, 0);
  assert.equal(r.source, "refunded_amount");
  assert.equal(r.refundEvents.length, 0);
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.onePartial);
  assert.equal(r.amountRefunded, 10);
  assert.equal(r.source, "refunded_amount");
  assert.equal(r.refundEvents.length, 1);
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.multiplePartials);
  assert.equal(r.amountRefunded, 35);
  assert.equal(r.refundEvents.length, 2);
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.fullRefund);
  assert.equal(r.amountRefunded, 42);
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.failedRefundEvent);
  assert.equal(r.amountRefunded, 0, "FAILED/PENDING refund events must not count");
  assert.equal(r.refundEvents.length, 0);
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.duplicateRepresentations);
  assert.equal(r.amountRefunded, 12, "duplicate event ids must not double-count");
  assert.equal(r.refundEvents.length, 1);
  assert.equal(r.source, "transaction_events");
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.compactEventsOnly);
  assert.equal(r.amountRefunded, 8, "CHARGE_BACK and PAYOUT_DEDUCTION must not count");
  assert.equal(r.refundEvents.length, 1);
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.statusFullOnly);
  assert.equal(r.amountRefunded, 30);
  assert.equal(r.source, "status_full_amount");
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.refundedAmountAuthoritative);
  assert.equal(r.amountRefunded, 40, "refunded_amount is authoritative over event sum");
  assert.equal(r.source, "refunded_amount");
}

{
  const r = parseSumUpRefundedTotal(FIXTURES.multiplePartialsEventsOnly);
  assert.equal(r.amountRefunded, 35, "sum completed REFUND events only");
  assert.equal(r.refundEvents.length, 2);
  assert.equal(r.source, "transaction_events");
}

console.log("OK  SumUp reconciliation fixtures");

console.log("=== getSumUpTransactionDetails uses documented endpoint ===");
const sumup = read("shared/sumup-checkout.ts");
assert.match(sumup, /\/v2\.1\/merchants\/.*\/transactions\?id=/);
assert.match(sumup, /transaction_events/);
assert.match(sumup, /refunded_amount/);
assert.doesNotMatch(sumup, /amount_refunded/);
assert.doesNotMatch(sumup, /payload\?\.refunds/);
assert.match(sumup, /CHARGE_BACK|PAYOUT_DEDUCTION/);
assert.match(sumup, /FAILED/);
console.log("OK  documented retrieve-transaction wiring");

console.log("=== Durable Object does not hold blockConcurrencyWhile across I/O ===");
const coordinator = read("workers/addresses/src/refund-coordinator.ts");
assert.match(coordinator, /reserveOperation/);
assert.match(coordinator, /blockConcurrencyWhile/);
assert.match(coordinator, /OUTSIDE blockConcurrencyWhile|runs OUTSIDE/i);
assert.match(coordinator, /reconciliation_required/);
assert.match(coordinator, /processBookingRefundOrCancel/);
assert.match(coordinator, /onProcessorAccepted/);
assert.match(coordinator, /processor_accepted/);
// Must not wrap the whole process inside a single blockConcurrencyWhile call site only.
const blockBlocks = [...coordinator.matchAll(/blockConcurrencyWhile\(/g)];
assert.ok(blockBlocks.length >= 2, "expect short reserve + terminal update blocks, not one mega-lock");
assert.match(coordinator, /Another refund operation is already in progress/);
assert.doesNotMatch(
  coordinator,
  /blockConcurrencyWhile\(async \(\) =>\s*processBookingRefundOrCancel/,
);
const handlers = read("workers/addresses/src/refund-handlers.ts");
assert.match(handlers, /onProcessorAccepted/);
assert.match(
  handlers,
  /operationState: \"processor_accepted\"[\s\S]{0,400}onProcessorAccepted/,
);
console.log("OK  DO operation-state coordinator pattern");

console.log("\nAll SumUp refund reconcile checks passed.");
