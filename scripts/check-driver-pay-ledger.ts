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
  bookingLevelDriverAssignDecision,
  clearDriverPayForDeassignment,
  correctDriverPayToUnpaid,
  DRIVER_PAY_LEDGER_TTL_SECONDS,
  driverPayJourneyKey,
  driverPayShownForLeg,
  durableRecordToSummaryJob,
  formatDriverPayPaidAt,
  legMayUseBookingPayFallback,
  MULTI_LEG_BOOKING_ASSIGN_ERROR,
  oweDriverPayOnCompletion,
  parseDriverPayToPence,
  recordDriverAsPaid,
  reopenDriverPayObligation,
  summariseDriverPay,
  toDurableDriverPayRecord,
  type DriverPayLedgerState,
} from "../shared/driver-pay-ledger";
import { buildSanitizedDriverJobView } from "../shared/driver-portal-access";
import {
  getDurableDriverPay,
  listDurableDriverPay,
  persistTrackingDriverPay,
  upsertDriverPayLedger,
} from "../workers/addresses/src/driver-pay-store";
import {
  handleCorrectDriverPaidRequest,
  handleOwnerDriverPaymentsSummaryRequest,
  handleRecordDriverPaidRequest,
} from "../workers/addresses/src/driver-pay-handlers";

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

check("A legacy single-leg amount still shows to the driver, and a shared return amount does not", () => {
  for (const legacy of ["£45", "45", "45.00"]) {
    const shown = driverPayShownForLeg({
      job: { driverPayAmount: legacy },
      linkedJourneyCount: 1,
    });
    assert.equal(shown, "£45.00", legacy);
    const view = buildSanitizedDriverJobView(
      {
        driverPayAmount: legacy,
        amountPaidLabel: "£120.00",
        quotedPrice: 120,
        paymentReference: "SUMUP",
        customerEmail: "customer@example.com",
        sumupCheckoutId: "chk_secret",
      },
      { driverPayAmount: shown },
      { accepted: true },
    );
    assert.equal(view.driverPayAmount, "£45.00", legacy);
    for (const forbidden of [
      "amountPaidLabel",
      "quotedPrice",
      "paymentReference",
      "customerEmail",
      "sumupCheckoutId",
      "driverPayAmountPence",
    ]) {
      assert.equal(forbidden in view, false, forbidden);
    }
  }

  const withoutBooking = driverPayShownForLeg({
    job: { driverPayAmount: "£45" },
    linkedJourneyCount: 1,
  });
  assert.equal(withoutBooking, "£45.00");

  const outboundLegacy = driverPayShownForLeg({
    job: { driverPayAmount: "£45" },
    bookingPayAmount: "£45",
    linkedJourneyCount: 2,
    journeyLeg: "outbound",
    pairedToken: "leg-ret",
  });
  const returnLegacy = driverPayShownForLeg({
    job: { driverPayAmount: "£45" },
    bookingPayAmount: "£45",
    linkedJourneyCount: 2,
    journeyLeg: "return",
    pairedToken: "leg-out",
  });
  assert.equal(outboundLegacy, undefined);
  assert.equal(returnLegacy, undefined);

  const assigned = applyDriverPayAssignment(
    {},
    { amountInput: "55.50", driverName: "Ben Driver", profileKey: "ben", nowIso: NOW },
  );
  assert.equal(assigned.ok, true);
  if (!assigned.ok) return;
  assert.equal(
    driverPayShownForLeg({
      job: assigned.record,
      bookingPayAmount: "£45",
      linkedJourneyCount: 1,
    }),
    "£55.50",
  );
  assert.equal(
    driverPayShownForLeg({
      job: assigned.record,
      bookingPayAmount: "£45",
      linkedJourneyCount: 2,
      journeyLeg: "return",
      pairedToken: "leg-out",
    }),
    "£55.50",
  );
  assert.notEqual(
    driverPayShownForLeg({
      job: { driverPayAmount: "£45" },
      bookingPayAmount: "£55.50",
      linkedJourneyCount: 2,
      journeyLeg: "outbound",
      pairedToken: "leg-ret",
    }),
    "£55.50",
  );
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
  const bookingAssignFn = bookingAssign.slice(
    bookingAssign.indexOf("export async function handleBookingJobAssignDriverRequest"),
  );
  const rejectAt = bookingAssignFn.indexOf("bookingLevelDriverAssignDecision");
  assert.ok(rejectAt >= 0);
  assert.ok(rejectAt < bookingAssignFn.indexOf("deleteDriverAcceptToken"));
  assert.ok(rejectAt < bookingAssignFn.indexOf("saveBookingJob"));
  assert.ok(rejectAt < bookingAssignFn.indexOf("syncTrackingAssignmentFromBooking"));
  assert.ok(rejectAt < bookingAssignFn.indexOf("trySendEmail"));
  assert.match(bookingAssignFn, /MULTI_LEG_BOOKING_ASSIGN_ERROR|bookingLevelDriverAssignDecision/);
  const summaryStart = handlers.indexOf("export async function handleOwnerDriverPaymentsSummaryRequest");
  const summaryFn = handlers.slice(summaryStart, handlers.indexOf("async function readPayBody"));
  assert.match(summaryFn, /listDurableDriverPay/);
  assert.doesNotMatch(summaryFn, /listTrackingJobsForRecentDays|listUpcomingTrackingJobs|track:day:/);
  const trackingStore = read("workers/addresses/src/tracking-store.ts");
  assert.match(trackingStore, /TRACKING_JOB_TTL_SECONDS = 60 \* 60 \* 24 \* 45/);
  assert.ok(DRIVER_PAY_LEDGER_TTL_SECONDS > 370 * 24 * 60 * 60);
  assert.ok(DRIVER_PAY_LEDGER_TTL_SECONDS > 45 * 24 * 60 * 60);
  const assignFn = assign.slice(
    assign.indexOf("export async function handleDriverAssignRequest"),
    assign.indexOf("export async function handleDriverDeassignRequest"),
  );
  assert.ok(assignFn.indexOf("saveTrackingJob") < assignFn.indexOf("syncDurableDriverPayFromTracking"));
  assert.ok(deassignFn.indexOf("saveTrackingJob") < deassignFn.indexOf("syncDurableDriverPayFromTracking"));
  assert.match(journey, /syncDurableDriverPayFromTracking/);
  assert.match(reopen, /syncDurableDriverPayFromTracking/);
  assert.match(handlers, /syncDurableDriverPayFromTracking/);
  assert.match(bookingAssign, /syncDurableDriverPayFromTracking/);
  const jobsList = read("workers/addresses/src/tracking-handlers.ts");
  const enrich = read("workers/addresses/src/driver-booking-handlers.ts");
  assert.match(jobsList, /driverPayAmountVisibleForJob/);
  assert.match(enrich, /driverPayAmountVisibleForJob/);
  assert.doesNotMatch(jobsList, /driverPayAmountLabel\(job\) \|\|/);
  assert.doesNotMatch(enrich, /driverPayAmountLabel\(job\) \|\|/);
  const ui = read("src/components/DriverPayPanel.tsx");
  assert.match(ui, /Record driver as paid/);
  assert.match(ui, /This records a payment you have already made/);
  assert.match(ui, /Mark as unpaid/);
  assert.match(ui, /does not reverse or recover a real payment/);
  assert.doesNotMatch(ui, /Pay Driver/);
  const money = read("src/components/OwnerDriverPaymentsPanel.tsx");
  assert.match(money, /Record driver as paid/);
  assert.match(money, /This records a payment you have already made/);
  assert.doesNotMatch(money, /Pay Driver/);
  assert.match(recordFn, /getDurableDriverPay/);
  assert.ok(recordFn.indexOf("getTrackingJob") < recordFn.indexOf("getDurableDriverPay"));
  const correctStart = handlers.indexOf("export async function handleCorrectDriverPaidRequest");
  const correctFn = handlers.slice(correctStart);
  assert.match(correctFn, /getDurableDriverPay/);
  assert.ok(correctFn.indexOf("getTrackingJob") < correctFn.indexOf("getDurableDriverPay"));
});

function memoryKv() {
  const rows = new Map<string, { value: string; ttl?: number }>();
  return {
    rows,
    async get(key: string) {
      const row = rows.get(key);
      if (!row) return null;
      return JSON.parse(row.value) as unknown;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      rows.set(key, { value, ttl: options?.expirationTtl });
    },
    async delete(key: string) {
      rows.delete(key);
    },
  };
}

async function checkAsync(label: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    console.error(error);
    process.exitCode = 1;
  }
}

void (async () => {
  await checkAsync("Durable ledger outlives the tracking job and stays in the year report", async () => {
    const kv = memoryKv();
    const store = kv as unknown as Parameters<typeof upsertDriverPayLedger>[0];
    const paid = toDurableDriverPayRecord({
      token: "tok-paid",
      tripDate: "2026-01-15",
      pickupLabel: "Home",
      dropoffLabel: "Belfast International",
      journeyLeg: "outbound",
      bookingReference: "MAT-100",
      driverPayAmountPence: 4500,
      driverPayStatus: "paid",
      driverPayPaidAt: "2026-01-20T12:00:00.000Z",
      driverPayMethod: "bank_transfer",
      driverPayProviderReference: "BANK-100",
      driverPayStatusUpdatedAt: "2026-01-20T12:00:00.000Z",
      driverPayDriverProfileKey: "ann",
      driverPayDriverName: "Ann Driver",
      customerEmail: "customer@example.com",
      customerMobile: "07700900123",
      sumupCheckoutId: "chk_secret",
      quotedPrice: 90,
      margin: 12,
      refunds: [{ id: "refund-1" }],
      paymentReference: "SUMUP-PAY-REF",
    });
    assert.ok(paid);
    const savedKeys = Object.keys(paid);
    for (const forbidden of [
      "customerEmail",
      "customerMobile",
      "sumupCheckoutId",
      "quotedPrice",
      "margin",
      "refunds",
    ]) {
      assert.equal(savedKeys.includes(forbidden), false, forbidden);
    }
    assert.doesNotMatch(JSON.stringify(paid), /customer@example.com|07700900123|chk_secret|SUMUP-PAY-REF/);
    assert.equal(paid.paymentReference, "BANK-100");
    assert.equal(paid.bookingReference, "MAT-100");
    await upsertDriverPayLedger(store, paid);
    const journeyRow = kv.rows.get(driverPayJourneyKey("tok-paid"));
    assert.equal(journeyRow?.ttl, DRIVER_PAY_LEDGER_TTL_SECONDS);
    kv.rows.set("track:job:tok-paid", { value: "{}", ttl: 60 * 60 * 24 * 45 });
    kv.rows.delete("track:job:tok-paid");
    kv.rows.delete("track:day:2026-01-15");
    const listed = await listDurableDriverPay(store);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.trackingToken, "tok-paid");
    assert.equal(listed[0]?.driverPayAmountPence, 4500);
    const year = summariseDriverPay(
      listed.map(durableRecordToSummaryJob),
      "year",
      new Date("2026-10-06T12:00:00.000Z"),
    );
    assert.equal(year.paidPence, 4500);
    const loaded = await getDurableDriverPay(store, "tok-paid");
    assert.equal(loaded?.status, "paid");
    assert.equal(loaded?.paymentMethod, "bank_transfer");
  });

  await checkAsync("Single-leg enquiry pay is kept, and a two-leg booking cannot share one amount", async () => {
    assert.deepEqual(bookingLevelDriverAssignDecision(0), { ok: true });
    assert.deepEqual(bookingLevelDriverAssignDecision(1), { ok: true });
    const rejected = bookingLevelDriverAssignDecision(2);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error, MULTI_LEG_BOOKING_ASSIGN_ERROR);

    const single = applyDriverPayAssignment(
      {},
      { amountInput: "45", driverName: "Ann Driver", profileKey: "ann", nowIso: NOW },
    );
    assert.equal(single.ok, true);
    if (!single.ok) return;
    assert.equal(
      driverPayShownForLeg({
        job: single.record,
        bookingPayAmount: "£45.00",
        linkedJourneyCount: 1,
      }),
      "£45.00",
    );
    assert.equal(
      legMayUseBookingPayFallback({ hasOwnLedgerAmount: false, linkedJourneyCount: 1 }),
      true,
    );
    assert.equal(
      driverPayShownForLeg({
        job: {},
        bookingPayAmount: "£45.00",
        linkedJourneyCount: 1,
      }),
      "£45.00",
    );

    const outbound = applyDriverPayAssignment(
      {},
      { amountInput: "40", driverName: "Ann Driver", profileKey: "ann", nowIso: NOW },
    );
    const inbound = applyDriverPayAssignment(
      {},
      { amountInput: "55.50", driverName: "Ben Driver", profileKey: "ben", nowIso: NOW },
    );
    assert.equal(outbound.ok, true);
    assert.equal(inbound.ok, true);
    if (!outbound.ok || !inbound.ok) return;
    const kv = memoryKv();
    const store = kv as unknown as Parameters<typeof persistTrackingDriverPay>[0];
    await persistTrackingDriverPay(store, {
      token: "leg-out",
      tripDate: "2026-10-06",
      pickupLabel: "Home",
      dropoffLabel: "BFS",
      journeyLeg: "outbound",
      bookingReference: "MAT-200",
      ...outbound.record,
    });
    await persistTrackingDriverPay(store, {
      token: "leg-ret",
      tripDate: "2026-10-10",
      pickupLabel: "BFS",
      dropoffLabel: "Home",
      journeyLeg: "return",
      bookingReference: "MAT-200",
      ...inbound.record,
    });
    const outRecord = await getDurableDriverPay(store, "leg-out");
    const retRecord = await getDurableDriverPay(store, "leg-ret");
    assert.equal(outRecord?.driverPayAmountPence, 4000);
    assert.equal(retRecord?.driverPayAmountPence, 5550);
    assert.equal(outRecord?.driverProfileKey, "ann");
    assert.equal(retRecord?.driverProfileKey, "ben");
    assert.notEqual(outRecord?.driverPayAmountPence, retRecord?.driverPayAmountPence);

    const outboundShown = driverPayShownForLeg({
      job: outbound.record,
      bookingPayAmount: "£55.50",
      linkedJourneyCount: 2,
      journeyLeg: "outbound",
      pairedToken: "leg-ret",
    });
    const returnShown = driverPayShownForLeg({
      job: inbound.record,
      bookingPayAmount: "£40.00",
      linkedJourneyCount: 2,
      journeyLeg: "return",
      pairedToken: "leg-out",
    });
    const bareOutbound = driverPayShownForLeg({
      job: {},
      bookingPayAmount: "£55.50",
      linkedJourneyCount: 2,
      journeyLeg: "outbound",
      pairedToken: "leg-ret",
    });
    const bareReturn = driverPayShownForLeg({
      job: {},
      bookingPayAmount: "£40.00",
      linkedJourneyCount: 2,
      journeyLeg: "return",
      pairedToken: "leg-out",
    });
    assert.equal(outboundShown, "£40.00");
    assert.equal(returnShown, "£55.50");
    assert.equal(bareOutbound, undefined);
    assert.equal(bareReturn, undefined);
    assert.equal(
      legMayUseBookingPayFallback({
        hasOwnLedgerAmount: false,
        linkedJourneyCount: 2,
        journeyLeg: "outbound",
        pairedToken: "leg-ret",
      }),
      false,
    );
    const outboundView = buildSanitizedDriverJobView(
      {},
      { driverPayAmount: outboundShown, driverPayStatus: "pending" },
      { accepted: true },
    );
    const returnView = buildSanitizedDriverJobView(
      {},
      { driverPayAmount: returnShown, driverPayStatus: "pending" },
      { accepted: true },
    );
    assert.equal(outboundView.driverPayAmount, "£40.00");
    assert.equal(returnView.driverPayAmount, "£55.50");
    assert.notEqual(outboundView.driverPayAmount, returnView.driverPayAmount);
  });

  await checkAsync("An expired tracking job can still be recorded paid from the durable ledger", async () => {
    const kv = memoryKv();
    const store = kv as unknown as Parameters<typeof upsertDriverPayLedger>[0];
    const unpaid = toDurableDriverPayRecord({
      token: "old-unpaid",
      tripDate: "2026-06-01",
      pickupLabel: "Home",
      dropoffLabel: "BFS",
      journeyLeg: "outbound",
      bookingReference: "MAT-OLD",
      driverPayAmountPence: 4500,
      driverPayStatus: "unpaid",
      driverPayStatusUpdatedAt: "2026-06-01T18:00:00.000Z",
      driverPayDriverProfileKey: "ann",
      driverPayDriverName: "Ann Driver",
    });
    assert.ok(unpaid);
    await upsertDriverPayLedger(store, unpaid);
    kv.rows.delete("track:job:old-unpaid");

    const env = {
      OWNER_ACCESS_KEY: "owner-secret",
      DRIVER_ACCESS_KEY: "driver-secret",
      TRACKING_STORE: store,
    };

    function post(path: string, body: Record<string, unknown>, headers: Record<string, string>) {
      return new Request(`https://worker.test${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    }

    const denied = await handleRecordDriverPaidRequest(
      post(
        "/owner/driver-payments/record",
        { token: "old-unpaid", method: "cash" },
        { "X-Driver-Key": "driver-secret" },
      ),
      env,
      null,
    );
    assert.equal(denied.status, 401);
    assert.equal((await getDurableDriverPay(store, "old-unpaid"))?.status, "unpaid");

    const sessionDenied = await handleRecordDriverPaidRequest(
      post(
        "/owner/driver-payments/record",
        { token: "old-unpaid", method: "cash" },
        { "X-Owner-Key": "owner-secret", "X-Driver-Session": "driver-session" },
      ),
      env,
      null,
    );
    assert.equal(sessionDenied.status, 401);

    const recorded = await handleRecordDriverPaidRequest(
      post(
        "/owner/driver-payments/record",
        {
          token: "old-unpaid",
          method: "bank_transfer",
          reference: "BANK-44",
          driverPayAmount: "£1.00",
          driverPayAmountPence: 100,
          driverPayStatus: "paid",
          driverName: "Hacker",
          profileKey: "hacker",
        },
        { "X-Owner-Key": "owner-secret" },
      ),
      env,
      null,
    );
    assert.equal(recorded.status, 200);
    const paidBody = (await recorded.json()) as { ok?: boolean; idempotent?: boolean };
    assert.equal(paidBody.ok, true);
    assert.equal(paidBody.idempotent, false);
    const paid = await getDurableDriverPay(store, "old-unpaid");
    assert.equal(paid?.status, "paid");
    assert.equal(paid?.paymentMethod, "bank_transfer");
    assert.equal(paid?.paymentReference, "BANK-44");
    assert.equal(paid?.driverPayAmountPence, 4500);
    assert.equal(paid?.driverName, "Ann Driver");
    assert.equal(paid?.driverProfileKey, "ann");
    assert.ok(paid?.paidAt);
    assert.ok(paid?.statusUpdatedAt);
    const firstPaidAt = paid?.paidAt;
    const firstUpdated = paid?.statusUpdatedAt;

    const summaryResponse = await handleOwnerDriverPaymentsSummaryRequest(
      new Request("https://worker.test/owner/driver-payments?period=year", {
        headers: { "X-Owner-Key": "owner-secret" },
      }),
      env,
      null,
    );
    assert.equal(summaryResponse.status, 200);
    const summary = (await summaryResponse.json()) as {
      outstandingPence: number;
      paidPence: number;
      outstanding: { token: string }[];
    };
    assert.equal(summary.outstandingPence, 0);
    assert.equal(summary.paidPence, 4500);
    assert.deepEqual(
      summary.outstanding.map((item) => item.token),
      [],
    );

    const again = await handleRecordDriverPaidRequest(
      post(
        "/owner/driver-payments/record",
        { token: "old-unpaid", method: "cash", reference: "CHANGED" },
        { "X-Owner-Key": "owner-secret" },
      ),
      env,
      null,
    );
    const againBody = (await again.json()) as { idempotent?: boolean };
    assert.equal(again.status, 200);
    assert.equal(againBody.idempotent, true);
    const stillPaid = await getDurableDriverPay(store, "old-unpaid");
    assert.equal(stillPaid?.paidAt, firstPaidAt);
    assert.equal(stillPaid?.statusUpdatedAt, firstUpdated);
    assert.equal(stillPaid?.paymentMethod, "bank_transfer");
    assert.equal(stillPaid?.paymentReference, "BANK-44");
    assert.equal(stillPaid?.driverPayAmountPence, 4500);

    const driverCorrect = await handleCorrectDriverPaidRequest(
      post("/owner/driver-payments/correct", { token: "old-unpaid" }, { "X-Driver-Key": "driver-secret" }),
      env,
      null,
    );
    assert.equal(driverCorrect.status, 401);
    assert.equal((await getDurableDriverPay(store, "old-unpaid"))?.status, "paid");

    const corrected = await handleCorrectDriverPaidRequest(
      post(
        "/owner/driver-payments/correct",
        { token: "old-unpaid", driverPayStatus: "pending", driverPayAmountPence: 100 },
        { "X-Owner-Key": "owner-secret" },
      ),
      env,
      null,
    );
    assert.equal(corrected.status, 200);
    const unpaidAgain = await getDurableDriverPay(store, "old-unpaid");
    assert.equal(unpaidAgain?.status, "unpaid");
    assert.equal(unpaidAgain?.paidAt, undefined);
    assert.equal(unpaidAgain?.paymentMethod, undefined);
    assert.equal(unpaidAgain?.paymentReference, undefined);
    assert.equal(unpaidAgain?.driverPayAmountPence, 4500);
    assert.equal(unpaidAgain?.driverName, "Ann Driver");

    const after = await handleOwnerDriverPaymentsSummaryRequest(
      new Request("https://worker.test/owner/driver-payments?period=year", {
        headers: { "X-Owner-Key": "owner-secret" },
      }),
      env,
      null,
    );
    const afterBody = (await after.json()) as {
      outstandingPence: number;
      paidPence: number;
      outstanding: { token: string }[];
    };
    assert.equal(afterBody.outstandingPence, 4500);
    assert.equal(afterBody.paidPence, 0);
    assert.deepEqual(
      afterBody.outstanding.map((item) => item.token),
      ["old-unpaid"],
    );
  });

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
  console.log("\nAll driver payment ledger checks passed.");
})();
