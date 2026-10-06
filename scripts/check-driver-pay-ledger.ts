/**
 * Driver payment ledger. Accounting only — no payouts.
 * Run: npx tsx scripts/check-driver-pay-ledger.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  alignDriverPayAmount,
  applyDriverPayAssignment,
  clearDriverPayForDeassignment,
  correctDriverPayToUnpaid,
  formatDriverPayPaidAt,
  oweDriverPayOnCompletion,
  parseDriverPayToPence,
  recordDriverAsPaid,
  reopenDriverPayObligation,
  summariseDriverPay,
  type DriverPayLedgerState,
} from "../shared/driver-pay-ledger";
import { buildSanitizedDriverJobView } from "../shared/driver-portal-access";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, run: () => void) {
  try {
    run();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const NOW = "2026-10-06T18:15:00.000Z";

check("£45, 45 and 45.00 parse to 4500 pence, and 45.50 parses to 4550", () => {
  for (const input of ["£45", "45", "45.00", "£45.00"]) {
    const parsed = parseDriverPayToPence(input);
    assert.equal(parsed.ok, true, input);
    if (parsed.ok) assert.equal(parsed.pence, 4500, input);
  }
  const half = parseDriverPayToPence("45.50");
  assert.equal(half.ok, true);
  if (half.ok) assert.equal(half.pence, 4550);
  const oneDecimal = parseDriverPayToPence("45.5");
  assert.equal(oneDecimal.ok, true);
  if (oneDecimal.ok) assert.equal(oneDecimal.pence, 4550);
});

check("Invalid, negative, zero, and over-precise amounts are rejected", () => {
  for (const input of ["", "abc", "£", "45.5.0", "45.", "--1"]) {
    assert.equal(parseDriverPayToPence(input).ok, false, input);
  }
  const negative = parseDriverPayToPence("-5");
  assert.equal(negative.ok, false);
  if (!negative.ok) assert.match(negative.error, /negative/);
  const zero = parseDriverPayToPence("0");
  assert.equal(zero.ok, false);
  if (!zero.ok) assert.match(zero.error, /more than zero/);
  const zeroPounds = parseDriverPayToPence("0.00");
  assert.equal(zeroPounds.ok, false);
  const precise = parseDriverPayToPence("45.555");
  assert.equal(precise.ok, false);
  if (!precise.ok) assert.match(precise.error, /2 decimal/);
});

check("New assignments store pence, derive the label, and start as pending", () => {
  const assigned = applyDriverPayAssignment(
    {},
    {
      amountInput: "45",
      driverName: "Ann Driver",
      profileKey: "driver-a",
      nowIso: NOW,
    },
  );
  assert.equal(assigned.ok, true);
  if (!assigned.ok) return;
  assert.equal(assigned.record.driverPayAmountPence, 4500);
  assert.equal(assigned.record.driverPayAmount, "£45.00");
  assert.equal(assigned.record.driverPayStatus, "pending");
  assert.equal(assigned.record.driverPayDriverProfileKey, "driver-a");
  assert.equal(assigned.record.driverPayDriverName, "Ann Driver");
  assert.equal(assigned.record.driverPayPaidAt, undefined);
});

check("Legacy driverPayAmount is parsed on the next write and cannot diverge from pence", () => {
  const aligned = alignDriverPayAmount({ driverPayAmount: "£45" });
  assert.equal(aligned.driverPayAmountPence, 4500);
  assert.equal(aligned.driverPayAmount, "£45.00");
  const drifted = alignDriverPayAmount({
    driverPayAmount: "£10",
    driverPayAmountPence: 4550,
  });
  assert.equal(drifted.driverPayAmountPence, 4550);
  assert.equal(drifted.driverPayAmount, "£45.50");
});

check("Completion moves pending to unpaid once, and a second completion changes nothing", () => {
  const assigned = applyDriverPayAssignment(
    {},
    { amountInput: "45.00", driverName: "Ann", profileKey: "driver-a", nowIso: NOW },
  );
  assert.equal(assigned.ok, true);
  if (!assigned.ok) return;
  const first = oweDriverPayOnCompletion(assigned.record, { nowIso: NOW, cancelled: false });
  assert.equal(first.changed, true);
  assert.equal(first.job.driverPayStatus, "unpaid");
  assert.equal(first.job.driverPayAmountPence, 4500);
  const second = oweDriverPayOnCompletion(first.job, { nowIso: "2026-10-06T19:00:00.000Z", cancelled: false });
  assert.equal(second.changed, false);
  assert.equal(second.job.driverPayStatus, "unpaid");
  assert.equal(second.job.driverPayStatusUpdatedAt, first.job.driverPayStatusUpdatedAt);
  assert.equal(second.job.driverPayPaidAt, undefined);
});

check("A cancelled journey does not become owed", () => {
  const assigned = applyDriverPayAssignment(
    {},
    { amountInput: "45", driverName: "Ann", nowIso: NOW },
  );
  assert.equal(assigned.ok, true);
  if (!assigned.ok) return;
  const cancelled = oweDriverPayOnCompletion(
    { ...assigned.record, driverPayStatus: "pending" },
    { nowIso: NOW, cancelled: true },
  );
  assert.equal(cancelled.changed, false);
  assert.equal(cancelled.job.driverPayStatus, "pending");
});

check("Outbound and return legs are independent obligations", () => {
  const outbound = oweDriverPayOnCompletion(
    applyDriverPayAssignment(
      {},
      { amountInput: "45", driverName: "Ann", profileKey: "driver-a", nowIso: NOW },
    ).ok
      ? (
          applyDriverPayAssignment(
            {},
            { amountInput: "45", driverName: "Ann", profileKey: "driver-a", nowIso: NOW },
          ) as { ok: true; record: DriverPayLedgerState }
        ).record
      : {},
    { nowIso: NOW, cancelled: false },
  ).job;
  const returnAssigned = applyDriverPayAssignment(
    {},
    { amountInput: "30", driverName: "Ben", profileKey: "driver-b", nowIso: NOW },
  );
  assert.equal(returnAssigned.ok, true);
  if (!returnAssigned.ok) return;
  const summary = summariseDriverPay(
    [
      {
        ...outbound,
        token: "out",
        tripDate: "2026-10-01",
        pickupLabel: "City Hall",
        dropoffLabel: "BFS",
        journeyStatus: "completed",
        journeyLeg: "outbound",
        bookingReference: "MAT-1",
      },
      {
        ...returnAssigned.record,
        token: "ret",
        tripDate: "2026-10-08",
        pickupLabel: "BFS",
        dropoffLabel: "City Hall",
        journeyStatus: "completed",
        journeyLeg: "return",
        bookingReference: "MAT-1",
      },
    ],
    "month",
    new Date(NOW),
  );
  assert.equal(outbound.driverPayStatus, "unpaid");
  assert.equal(returnAssigned.record.driverPayStatus, "pending");
  assert.equal(summary.outstandingPence, 4500);
  assert.equal(summary.outstanding.length, 1);
  assert.equal(summary.outstanding[0]?.token, "out");
  assert.equal(summary.outstanding[0]?.bookingReference, "MAT-1");
  assert.notEqual(outbound.driverPayAmountPence, returnAssigned.record.driverPayAmountPence);
});

check("Owner can record an unpaid journey as paid, and a second record does not change it", () => {
  const owed = oweDriverPayOnCompletion(
    (
      applyDriverPayAssignment(
        {},
        { amountInput: "£45", driverName: "Ann", profileKey: "driver-a", nowIso: NOW },
      ) as { ok: true; record: DriverPayLedgerState }
    ).record,
    { nowIso: NOW, cancelled: false },
  ).job;
  const paid = recordDriverAsPaid(owed, {
    method: "Bank transfer",
    reference: "REF-100",
    nowIso: NOW,
    journeyCompleted: true,
    cancelled: false,
  });
  assert.equal(paid.ok, true);
  if (!paid.ok) return;
  assert.equal(paid.idempotent, false);
  assert.equal(paid.record.driverPayStatus, "paid");
  assert.equal(paid.record.driverPayPaidAt, NOW);
  assert.equal(paid.record.driverPayMethod, "bank_transfer");
  assert.equal(paid.record.driverPayProviderReference, "REF-100");
  assert.equal(formatDriverPayPaidAt(paid.record.driverPayPaidAt!), "6 Oct 2026 at 19:15");
  const again = recordDriverAsPaid(paid.record, {
    method: "cash",
    reference: "OTHER",
    nowIso: "2026-10-07T10:00:00.000Z",
    journeyCompleted: true,
    cancelled: false,
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.idempotent, true);
  assert.equal(again.record.driverPayPaidAt, NOW);
  assert.equal(again.record.driverPayMethod, "bank_transfer");
  assert.equal(again.record.driverPayProviderReference, "REF-100");
  assert.equal(again.record, paid.record);
});

check("A driver view shows own pay status and paid date, not method, reference, or another driver", () => {
  const view = buildSanitizedDriverJobView(
    {
      customerName: "Alex",
      driverPayMethod: "bank_transfer",
      driverPayProviderReference: "SECRET-REF",
      driverPayAmountPence: 4500,
      amountPaidLabel: "£120.00",
      paymentReference: "SUMUP",
    },
    {
      driverPayAmount: "£45.00",
      driverPayStatus: "paid",
      driverPayPaidAt: NOW,
    },
    { accepted: true },
  );
  assert.equal(view.driverPayAmount, "£45.00");
  assert.equal(view.driverPayStatus, "paid");
  assert.equal(view.driverPayPaidAt, NOW);
  assert.equal("driverPayMethod" in view, false);
  assert.equal("driverPayProviderReference" in view, false);
  assert.equal("driverPayAmountPence" in view, false);
  assert.equal("amountPaidLabel" in view, false);
  const other = buildSanitizedDriverJobView(
    { customerName: "Other", driverPayAmount: "£90.00", driverPayStatus: "unpaid" },
    { driverPayAmount: "£90.00", driverPayStatus: "unpaid" },
    { accepted: true },
  );
  assert.notEqual(view.driverPayAmount, other.driverPayAmount);
  assert.notEqual(view.driverPayStatus, other.driverPayStatus);
});

check("Reassignment and deassignment cannot destroy a paid record", () => {
  const paid = {
    driverPayAmount: "£45.00",
    driverPayAmountPence: 4500,
    driverPayStatus: "paid" as const,
    driverPayPaidAt: NOW,
    driverPayMethod: "cash" as const,
    driverPayProviderReference: "CASH-1",
    driverPayDriverName: "Ann",
    driverPayDriverProfileKey: "driver-a",
  };
  const reassigned = applyDriverPayAssignment(paid, {
    amountInput: "20",
    driverName: "Ben",
    profileKey: "driver-b",
    nowIso: "2026-10-07T10:00:00.000Z",
  });
  assert.equal(reassigned.ok, false);
  if (!reassigned.ok) assert.match(reassigned.error, /cannot overwrite/);
  assert.equal(paid.driverPayStatus, "paid");
  assert.equal(paid.driverPayPaidAt, NOW);
  assert.equal(paid.driverPayDriverProfileKey, "driver-a");
  const cleared = clearDriverPayForDeassignment(paid);
  assert.equal(cleared.ok, false);
  if (!cleared.ok) assert.match(cleared.error, /cannot remove/);
  assert.equal(paid.driverPayProviderReference, "CASH-1");
});

check("Reopen returns unpaid to pending, leaves paid untouched, and recomplete owes again", () => {
  const unpaid = oweDriverPayOnCompletion(
    (
      applyDriverPayAssignment({}, { amountInput: "45", driverName: "Ann", nowIso: NOW }) as {
        ok: true;
        record: DriverPayLedgerState;
      }
    ).record,
    { nowIso: NOW, cancelled: false },
  ).job;
  const reopened = reopenDriverPayObligation(unpaid, "2026-10-06T20:00:00.000Z");
  assert.equal(reopened.changed, true);
  assert.equal(reopened.job.driverPayStatus, "pending");
  assert.equal(reopened.job.driverPayAmountPence, 4500);
  const again = oweDriverPayOnCompletion(reopened.job, {
    nowIso: "2026-10-06T21:00:00.000Z",
    cancelled: false,
  });
  assert.equal(again.job.driverPayStatus, "unpaid");
  const paid = recordDriverAsPaid(again.job, {
    method: "other",
    nowIso: NOW,
    journeyCompleted: true,
    cancelled: false,
  });
  assert.equal(paid.ok, true);
  if (!paid.ok) return;
  const reopenPaid = reopenDriverPayObligation(paid.record, "2026-10-08T09:00:00.000Z");
  assert.equal(reopenPaid.changed, false);
  assert.equal(reopenPaid.job.driverPayStatus, "paid");
  assert.equal(reopenPaid.job.driverPayPaidAt, NOW);
  assert.equal(reopenPaid.job, paid.record);
});

check("Mark as unpaid clears the mistaken paid record and does not invent a second one", () => {
  const paid = recordDriverAsPaid(
    oweDriverPayOnCompletion(
      (
        applyDriverPayAssignment({}, { amountInput: "45", driverName: "Ann", nowIso: NOW }) as {
          ok: true;
          record: DriverPayLedgerState;
        }
      ).record,
      { nowIso: NOW, cancelled: false },
    ).job,
    { method: "cash", reference: "WRONG", nowIso: NOW, journeyCompleted: true, cancelled: false },
  );
  assert.equal(paid.ok, true);
  if (!paid.ok) return;
  const corrected = correctDriverPayToUnpaid(paid.record, { nowIso: "2026-10-07T09:00:00.000Z", journeyCompleted: true });
  assert.equal(corrected.ok, true);
  if (!corrected.ok) return;
  assert.equal(corrected.record.driverPayStatus, "unpaid");
  assert.equal(corrected.record.driverPayPaidAt, undefined);
  assert.equal(corrected.record.driverPayMethod, undefined);
  assert.equal(corrected.record.driverPayProviderReference, undefined);
  assert.equal(corrected.record.driverPayAmountPence, 4500);
  const pendingOnly = correctDriverPayToUnpaid(
    { driverPayStatus: "pending", driverPayAmountPence: 4500 },
    { nowIso: NOW, journeyCompleted: false },
  );
  assert.equal(pendingOnly.ok, false);
});

check("Paid totals follow the reporting period and outstanding stays oldest first", () => {
  const summary = summariseDriverPay(
    [
      {
        token: "newer",
        tripDate: "2026-10-04",
        pickupLabel: "Home",
        dropoffLabel: "BHD",
        journeyStatus: "completed",
        driverPayAmountPence: 2000,
        driverPayAmount: "£20.00",
        driverPayStatus: "unpaid",
        driverPayDriverName: "Ben",
      },
      {
        token: "older",
        tripDate: "2026-09-02",
        pickupLabel: "City Hall",
        dropoffLabel: "BFS",
        journeyStatus: "completed",
        driverPayAmountPence: 4500,
        driverPayAmount: "£45.00",
        driverPayStatus: "unpaid",
        driverPayDriverName: "Ann",
        bookingReference: "MAT-9",
      },
      {
        token: "paid-sept",
        tripDate: "2026-09-20",
        pickupLabel: "A",
        dropoffLabel: "B",
        journeyStatus: "completed",
        driverPayAmountPence: 1000,
        driverPayStatus: "paid",
        driverPayPaidAt: "2026-09-20T12:00:00.000Z",
        driverPayDriverName: "Ann",
      },
      {
        token: "paid-oct",
        tripDate: "2026-10-02",
        pickupLabel: "C",
        dropoffLabel: "D",
        journeyStatus: "completed",
        driverPayAmountPence: 3000,
        driverPayStatus: "paid",
        driverPayPaidAt: NOW,
        driverPayDriverName: "Ben",
      },
      {
        token: "cancelled",
        tripDate: "2026-08-01",
        pickupLabel: "E",
        dropoffLabel: "F",
        journeyStatus: "completed",
        refundedAt: NOW,
        driverPayAmountPence: 9000,
        driverPayStatus: "unpaid",
        driverPayDriverName: "Ann",
      },
    ],
    "month",
    new Date(NOW),
  );
  assert.equal(summary.outstandingPence, 6500);
  assert.equal(summary.paidPence, 3000);
  assert.deepEqual(
    summary.outstanding.map((item) => item.token),
    ["older", "newer"],
  );
  assert.equal(summary.outstanding[0]?.bookingReference, "MAT-9");
});

check("Ledger handlers are owner-only and do not call SumUp or a payout provider", () => {
  const handlers = read("workers/addresses/src/driver-pay-handlers.ts");
  assert.match(handlers, /ownerAuthorized/);
  assert.doesNotMatch(handlers, /sumup|payouts\/|\/refunds/i);
  assert.doesNotMatch(handlers, /body\.driverPayStatus|body\.driverPayAmount|body\.profileKey|body\.driverName/);
  const recordStart = handlers.indexOf("export async function handleRecordDriverPaidRequest");
  const recordFn = handlers.slice(recordStart, handlers.indexOf("export async function handleCorrectDriverPaidRequest"));
  assert.match(recordFn, /recordDriverAsPaid/);
  assert.doesNotMatch(recordFn, /driverPayAmountPence\s*:/);
  const ledger = read("shared/driver-pay-ledger.ts");
  assert.match(ledger, /Do not pay drivers through SumUp/);
  assert.doesNotMatch(ledger, /payouts\/|from ["'].*sumup/i);
  const sumup = read("shared/sumup-checkout.ts");
  assert.doesNotMatch(sumup, /driverPayAmountPence|payouts\/|\/transfers/);
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /owner-driver-payments/);
  assert.doesNotMatch(index, /driver-payout|sumup\.com\/payouts/);
  const assign = read("workers/addresses/src/driver-assignment-handlers.ts");
  assert.match(assign, /driverPayBlocksReassignment/);
  assert.match(assign, /driverPayBlocksDeassignment/);
  assert.match(assign, /applyDriverPayAssignment/);
  const deassignAt = assign.indexOf("export async function handleDriverDeassignRequest");
  const deassignFn = assign.slice(deassignAt);
  assert.ok(deassignFn.indexOf("driverPayBlocksDeassignment") < deassignFn.indexOf("clearJobAssignment"));
  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /oweDriverPayOnCompletion/);
  const reopen = read("workers/addresses/src/reopen-job-handlers.ts");
  assert.match(reopen, /reopenDriverPayObligation/);
  const bookingAssign = read("workers/addresses/src/booking-job-handlers.ts");
  assert.match(bookingAssign, /resetSingleJourneyPay/);
  assert.match(bookingAssign, /jobs.length === 1/);
  const ui = read("src/components/DriverPayPanel.tsx");
  assert.match(ui, /Record driver as paid/);
  assert.match(ui, /This records a payment you have already made/);
  assert.match(ui, /Mark as unpaid/);
  assert.match(ui, /does not reverse or recover a real payment/);
  assert.doesNotMatch(ui, /Pay Driver/);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("\nAll driver payment ledger checks passed.");
