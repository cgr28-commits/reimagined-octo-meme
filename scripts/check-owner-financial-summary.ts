/**
 * Owner financial totals — period boundaries + accounting rules.
 * Run: npx tsx scripts/check-owner-financial-summary.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOwnerFinancialSummary,
  dayInInclusiveRange,
  formatGbpAmount,
  londonMonthRangeContaining,
  londonPaymentDay,
  londonWeekRangeContaining,
  londonYearRangeContaining,
  refundAmountInPeriod,
  type OwnerFinancialBookingInput,
} from "../shared/owner-financial-summary";
import type { RefundAuditEntry } from "../shared/refund-ops";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function booking(
  overrides: Partial<OwnerFinancialBookingInput> & {
    paymentReference: string;
    createdAt: string;
    amountPaidLabel: string;
  },
): OwnerFinancialBookingInput {
  const amount =
    typeof overrides.originalAmount === "number"
      ? overrides.originalAmount
      : typeof overrides.amount === "number"
        ? overrides.amount
        : Number(String(overrides.amountPaidLabel).replace(/[^\d.]/g, "")) || 0;
  return {
    paymentReference: overrides.paymentReference,
    createdAt: overrides.createdAt,
    amountPaidLabel: overrides.amountPaidLabel,
    customerName: overrides.customerName ?? "Customer",
    status: overrides.status ?? "confirmed",
    amount,
    originalAmount: typeof overrides.originalAmount === "number" ? overrides.originalAmount : amount,
    amountRefunded: overrides.amountRefunded ?? 0,
    tripDate: overrides.tripDate ?? "2026-08-20",
    refundedAt: overrides.refundedAt,
    refundHistory: overrides.refundHistory,
    paymentStatus: overrides.paymentStatus,
    operationalStatus: overrides.operationalStatus,
    additionalPayments: overrides.additionalPayments,
    isRefundTest: overrides.isRefundTest,
    isAmendmentTestFixture: overrides.isAmendmentTestFixture,
  };
}

function audit(partial: Partial<RefundAuditEntry> & { refundAmount: number; completedAt: string }): RefundAuditEntry {
  return {
    id: partial.id ?? `op-${partial.completedAt}`,
    bookingReference: partial.bookingReference ?? "REF",
    originalAmountPaid: partial.originalAmountPaid ?? 50,
    refundAmount: partial.refundAmount,
    cumulativeRefundedAmount: partial.cumulativeRefundedAmount ?? partial.refundAmount,
    remainingBalance: partial.remainingBalance ?? 0,
    currency: "GBP",
    fullOrPartial: partial.fullOrPartial ?? "full",
    cancelBooking: true,
    reasonCategory: "other",
    ownerNotes: "",
    requestedAt: partial.requestedAt ?? partial.completedAt,
    completedAt: partial.completedAt,
    success: true,
    customerEmailStatus: "skipped",
    ownerEmailStatus: "skipped",
    idempotencyKey: partial.idempotencyKey ?? `id-${partial.completedAt}`,
    actionKind: partial.actionKind ?? "cancel_full_refund",
    operationState: "completed",
    sumUpStatus: partial.sumUpStatus,
  };
}

console.log("=== Week / month / year boundaries (London) ===");
{
  // Wednesday 2026-08-19 → Mon 17 Aug – Sun 23 Aug
  const week = londonWeekRangeContaining("2026-08-19");
  assert.equal(week.fromDay, "2026-08-17");
  assert.equal(week.toDay, "2026-08-23");

  // Sunday stays in the week that started previous Monday
  const sunday = londonWeekRangeContaining("2026-08-23");
  assert.equal(sunday.fromDay, "2026-08-17");
  assert.equal(sunday.toDay, "2026-08-23");

  // Monday starts a new week
  const monday = londonWeekRangeContaining("2026-08-24");
  assert.equal(monday.fromDay, "2026-08-24");
  assert.equal(monday.toDay, "2026-08-30");

  const month = londonMonthRangeContaining("2026-08-19");
  assert.equal(month.fromDay, "2026-08-01");
  assert.equal(month.toDay, "2026-08-31");

  const feb = londonMonthRangeContaining("2026-02-10");
  assert.equal(feb.fromDay, "2026-02-01");
  assert.equal(feb.toDay, "2026-02-28");

  const year = londonYearRangeContaining("2026-08-19");
  assert.equal(year.fromDay, "2026-01-01");
  assert.equal(year.toDay, "2026-12-31");

  assert.equal(dayInInclusiveRange("2026-08-17", week.fromDay, week.toDay), true);
  assert.equal(dayInInclusiveRange("2026-08-16", week.fromDay, week.toDay), false);
  console.log("OK  week Mon–Sun · month · year boundaries");
}

console.log("=== Full / partial / external refund accounting ===");
{
  const now = new Date("2026-08-19T12:00:00Z");
  const paidThisWeek = booking({
    paymentReference: "PAY-WEEK",
    createdAt: "2026-08-18T10:00:00Z",
    amountPaidLabel: "£100.00",
    originalAmount: 100,
    customerName: "Week Paid",
  });
  const fullRefund = booking({
    paymentReference: "PAY-FULL",
    createdAt: "2026-08-18T11:00:00Z",
    amountPaidLabel: "£49.00",
    originalAmount: 49,
    amountRefunded: 49,
    status: "refunded",
    paymentStatus: "fully_refunded",
    refundedAt: "2026-08-19T09:00:00Z",
    customerName: "Full Refund",
    refundHistory: [
      audit({
        refundAmount: 49,
        completedAt: "2026-08-19T09:00:00Z",
        actionKind: "cancel_full_refund",
        sumUpStatus: "accepted",
      }),
    ],
  });
  const partial = booking({
    paymentReference: "PAY-PART",
    createdAt: "2026-08-10T10:00:00Z",
    amountPaidLabel: "£80.00",
    originalAmount: 80,
    amountRefunded: 20,
    status: "partially_refunded",
    paymentStatus: "partially_refunded",
    refundedAt: "2026-08-12T10:00:00Z",
    customerName: "Partial",
    refundHistory: [
      audit({
        refundAmount: 20,
        completedAt: "2026-08-12T10:00:00Z",
        actionKind: "partial_refund_keep_active",
        fullOrPartial: "partial",
        remainingBalance: 60,
        cumulativeRefundedAmount: 20,
      }),
    ],
  });
  const external = booking({
    paymentReference: "PAY-EXT",
    createdAt: "2026-08-05T10:00:00Z",
    amountPaidLabel: "£49.00",
    originalAmount: 49,
    amountRefunded: 49,
    status: "refunded",
    paymentStatus: "fully_refunded",
    refundedAt: "2026-08-19T15:00:00Z",
    customerName: "External",
    refundHistory: [
      audit({
        refundAmount: 49,
        completedAt: "2026-08-19T15:00:00Z",
        actionKind: "mark_external_refund",
        sumUpStatus: "external_manual_sumup",
      }),
    ],
  });

  const summary = buildOwnerFinancialSummary(
    [paidThisWeek, fullRefund, partial, external],
    now,
  );

  // Week: £100 net + £0 (full) = £100, 2 bookings created this week
  assert.equal(summary.week.count, 2);
  assert.equal(summary.week.total, 100);

  // Month includes all four; nets: 100 + 0 + 60 + 0 = 160
  assert.equal(summary.month.count, 4);
  assert.equal(summary.month.total, 160);

  // Year same as month in this fixture
  assert.equal(summary.year.total, 160);
  assert.equal(summary.year.count, 4);

  // Refunds this month: 49 (full) + 20 (partial) + 49 (external) = 118, 3 ops
  assert.equal(summary.refunds.total, 118);
  assert.equal(summary.refunds.count, 3);

  // External refund counted once (audit path, not double with amountRefunded)
  const extRefund = refundAmountInPeriod(
    external,
    summary.refunds.fromDay,
    summary.refunds.toDay,
  );
  assert.equal(extRefund.amount, 49);
  assert.equal(extRefund.opCount, 1);

  assert.equal(formatGbpAmount(100), "£100.00");
  console.log("OK  full £0 net · partial retained · external refund included once");
}

console.log("=== Test booking exclusion + return not double-counted ===");
{
  const now = new Date("2026-08-19T12:00:00Z");
  const real = booking({
    paymentReference: "PAY-REAL",
    createdAt: "2026-08-18T10:00:00Z",
    amountPaidLabel: "£70.00",
    originalAmount: 70,
    customerName: "Real",
    tripDate: "2026-08-25",
  });
  // Same payment appearing twice (outbound+return legs) must count once
  const duplicateLeg = { ...real, tripDate: "2026-08-28" };
  const testRefund = booking({
    paymentReference: "REFUND-TEST-ABC",
    createdAt: "2026-08-18T10:00:00Z",
    amountPaidLabel: "£1.00",
    originalAmount: 1,
    isRefundTest: true,
    customerName: "Test",
  });
  const amendTest = booking({
    paymentReference: "AMEND-TEST-XYZ",
    createdAt: "2026-08-18T10:00:00Z",
    amountPaidLabel: "£50.00",
    originalAmount: 50,
    isAmendmentTestFixture: true,
    customerName: "Amend",
  });
  const unpaid = booking({
    paymentReference: "PAY-ZERO",
    createdAt: "2026-08-18T10:00:00Z",
    amountPaidLabel: "£0.00",
    originalAmount: 0,
    customerName: "Zero",
  });

  const summary = buildOwnerFinancialSummary(
    [real, duplicateLeg, testRefund, amendTest, unpaid],
    now,
  );
  assert.equal(summary.week.count, 1);
  assert.equal(summary.week.total, 70);
  assert.equal(summary.week.items.length, 1);
  assert.equal(summary.week.items[0].paymentReference, "PAY-REAL");
  console.log("OK  tests/zero excluded · return legs not double-counted");
}

console.log("=== Payment day attribution ===");
{
  // Late evening UTC may still be same London day in August (BST)
  assert.equal(londonPaymentDay("2026-08-19T23:30:00Z"), "2026-08-20");
  assert.equal(londonPaymentDay("2026-08-19T10:00:00Z"), "2026-08-19");
  console.log("OK  London payment day from ISO");
}

console.log("=== UI + API wiring ===");
{
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerFinancialSummaryPanel/);
  const finAt = page.indexOf("<OwnerFinancialSummaryPanel");
  const shortAt = page.indexOf("<OwnerShortNoticePanel");
  assert.ok(finAt > 0 && finAt < shortAt, "financial summary above Booking Availability");

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.doesNotMatch(panel, /OwnerFinancialSummaryPanel/);

  const finUi = read("src/components/OwnerFinancialSummaryPanel.tsx");
  assert.match(finUi, /This week/i);
  assert.match(finUi, /This month/i);
  assert.match(finUi, /This year/i);
  assert.match(finUi, /Refunds/);
  assert.match(finUi, /Earned revenue/);
  assert.match(finUi, /Payments received/);
  assert.match(finUi, /grid-cols-2/);
  assert.match(finUi, /sm:grid-cols-4/);
  assert.match(finUi, /aria-expanded/);
  assert.match(finUi, /breakdown/i);
  assert.match(finUi, /cashReceived|buildOwnerOperationalMetrics/);

  const api = read("src/lib/paid-bookings-api.ts");
  assert.match(api, /fetchOwnerFinancialSummary/);
  assert.match(api, /financial-summary/);

  const handlers = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(handlers, /handlePaidBookingsFinancialSummaryRequest/);
  assert.match(handlers, /buildOwnerFinancialSummary/);
  assert.match(handlers, /buildOwnerCashReceived/);

  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /paid-bookings-financial-summary/);

  const layout = read("scripts/check-owner-dashboard-layout.ts");
  assert.match(layout, /OwnerFinancialSummaryPanel/);
  console.log("OK  Owner UI + worker endpoint wired");
}

console.log("\nAll owner financial summary checks passed.");
