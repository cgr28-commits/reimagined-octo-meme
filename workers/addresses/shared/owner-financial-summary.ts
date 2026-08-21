/**
 * Owner Dashboard financial totals — genuine paid-booking payment/refund books.
 * Periods use Europe/London calendar days. One payment reference = one booking.
 */

import {
  amountActuallyRefundedOf,
  grossAmountCollectedOf,
  netAmountRetainedOf,
  type PaidBookingRecord,
} from "./paid-booking-record";
import type { RefundAuditEntry } from "./refund-ops";
import { roundGbp } from "./refund-ops";
import {
  addDaysYmd,
  isOwnerOperationalTestBooking,
  londonYmd,
} from "./upcoming-jobs";

export type OwnerFinancialPeriodKey = "week" | "month" | "year" | "refunds";

export type OwnerFinancialLineItem = {
  paymentReference: string;
  createdAt: string;
  /** London YMD used for period attribution (payment created day). */
  paymentDay: string;
  customerName: string;
  amountPaid: number;
  amountRefunded: number;
  netAmount: number;
  status: string;
  refundStatusLabel: string;
  tripDate?: string;
};

export type OwnerFinancialBucket = {
  key: OwnerFinancialPeriodKey;
  label: string;
  /** Net revenue (week/month/year) or refund total (refunds). */
  total: number;
  count: number;
  countLabel: string;
  fromDay: string;
  toDay: string;
  items: OwnerFinancialLineItem[];
};

export type OwnerFinancialSummary = {
  asOfDay: string;
  week: OwnerFinancialBucket;
  month: OwnerFinancialBucket;
  year: OwnerFinancialBucket;
  refunds: OwnerFinancialBucket;
};

export type OwnerFinancialBookingInput = Pick<
  PaidBookingRecord,
  | "paymentReference"
  | "createdAt"
  | "customerName"
  | "status"
  | "operationalStatus"
  | "paymentStatus"
  | "amount"
  | "originalAmount"
  | "amountPaidLabel"
  | "additionalPayments"
  | "amountRefunded"
  | "refundedAt"
  | "refundHistory"
  | "tripDate"
  | "isRefundTest"
  | "isAmendmentTestFixture"
>;

/** London calendar day (YYYY-MM-DD) for an ISO instant. */
export function londonPaymentDay(
  iso: string | undefined | null,
  fallbackNow = new Date(),
): string {
  const raw = (iso ?? "").trim();
  if (raw) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return londonYmd(new Date(ms));
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  }
  return londonYmd(fallbackNow);
}

/**
 * Monday–Sunday week containing `day` (Europe/London civil date).
 * Monday = start, Sunday = end.
 */
export function londonWeekRangeContaining(
  day: string,
): { fromDay: string; toDay: string } {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : londonYmd();
  // Use noon UTC so weekday matches London civil date across DST.
  const noon = new Date(`${anchor}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(noon);
  const mondayOffset: Record<string, number> = {
    Mon: 0,
    Tue: -1,
    Wed: -2,
    Thu: -3,
    Fri: -4,
    Sat: -5,
    Sun: -6,
  };
  const offset = mondayOffset[weekday] ?? 0;
  const fromDay = addDaysYmd(anchor, offset);
  const toDay = addDaysYmd(fromDay, 6);
  return { fromDay, toDay };
}

export function londonMonthRangeContaining(
  day: string,
): { fromDay: string; toDay: string } {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : londonYmd();
  const [y, m] = anchor.split("-").map(Number);
  const fromDay = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const toDay = last.toISOString().slice(0, 10);
  return { fromDay, toDay };
}

export function londonYearRangeContaining(
  day: string,
): { fromDay: string; toDay: string } {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : londonYmd();
  const y = Number(anchor.slice(0, 4));
  return {
    fromDay: `${String(y).padStart(4, "0")}-01-01`,
    toDay: `${String(y).padStart(4, "0")}-12-31`,
  };
}

export function dayInInclusiveRange(
  day: string,
  fromDay: string,
  toDay: string,
): boolean {
  return day >= fromDay && day <= toDay;
}

function refundStatusLabel(input: {
  status?: string;
  paymentStatus?: string;
  amountPaid: number;
  amountRefunded: number;
}): string {
  if (input.status === "refunded" || input.paymentStatus === "fully_refunded") {
    return "REFUNDED";
  }
  if (input.status === "refunded_active") return "Fully refunded · Active";
  if (
    input.status === "partially_refunded" ||
    input.paymentStatus === "partially_refunded" ||
    (input.amountRefunded > 0.001 &&
      input.amountRefunded < input.amountPaid - 0.001)
  ) {
    return "Partially refunded";
  }
  if (input.status === "cancelled") return "Cancelled";
  if (input.amountRefunded > 0.001) return "Refunded";
  return "Paid";
}

/** Successful money refund ops from audit (SumUp API + external/manual). */
export function successfulRefundOps(
  history: RefundAuditEntry[] | undefined,
): RefundAuditEntry[] {
  if (!Array.isArray(history)) return [];
  return history.filter(
    (entry) =>
      entry.success === true &&
      (entry.operationState === "completed" ||
        entry.operationState === "processor_accepted") &&
      Number(entry.refundAmount) > 0.001,
  );
}

/**
 * Refund amount attributed to a London calendar period.
 * Prefer per-op audit timestamps; fall back to refundedAt + cumulative.
 * Never double-counts audit rows with the cumulative field.
 */
export function refundAmountInPeriod(
  booking: OwnerFinancialBookingInput,
  fromDay: string,
  toDay: string,
): { amount: number; opCount: number } {
  const ops = successfulRefundOps(booking.refundHistory);
  if (ops.length > 0) {
    let amount = 0;
    let opCount = 0;
    for (const op of ops) {
      const day = londonPaymentDay(
        op.completedAt || op.processorAcceptedAt || op.requestedAt,
      );
      if (!dayInInclusiveRange(day, fromDay, toDay)) continue;
      amount = roundGbp(amount + roundGbp(Number(op.refundAmount) || 0));
      opCount += 1;
    }
    return { amount, opCount };
  }

  const refunded = amountActuallyRefundedOf(booking);
  if (refunded <= 0.001) return { amount: 0, opCount: 0 };
  const day = londonPaymentDay(booking.refundedAt || booking.createdAt);
  if (!dayInInclusiveRange(day, fromDay, toDay)) return { amount: 0, opCount: 0 };
  return { amount: refunded, opCount: 1 };
}

export function isGenuinePaidFinancialBooking(
  booking: OwnerFinancialBookingInput,
): boolean {
  if (isOwnerOperationalTestBooking(booking)) return false;
  const paid = grossAmountCollectedOf(booking);
  if (!(paid > 0.001)) return false;
  const status = (booking.status || "").trim();
  if (status === "pending" || status === "failed" || status === "abandoned") {
    return false;
  }
  return true;
}

export function toFinancialLineItem(
  booking: OwnerFinancialBookingInput,
): OwnerFinancialLineItem {
  const amountPaid = grossAmountCollectedOf(booking);
  const amountRefunded = amountActuallyRefundedOf(booking);
  const netAmount = netAmountRetainedOf(booking);
  return {
    paymentReference: booking.paymentReference,
    createdAt: booking.createdAt,
    paymentDay: londonPaymentDay(booking.createdAt),
    customerName: booking.customerName || "—",
    amountPaid,
    amountRefunded,
    netAmount,
    status: booking.status || "confirmed",
    refundStatusLabel: refundStatusLabel({
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      amountPaid,
      amountRefunded,
    }),
    tripDate: booking.tripDate,
  };
}

function emptyBucket(
  key: OwnerFinancialPeriodKey,
  label: string,
  fromDay: string,
  toDay: string,
  countLabel: string,
): OwnerFinancialBucket {
  return { key, label, total: 0, count: 0, countLabel, fromDay, toDay, items: [] };
}

/**
 * Build Owner financial summary from paid-booking payment records.
 * Dedupes by paymentReference (outbound+return share one payment).
 */
export function buildOwnerFinancialSummary(
  bookings: OwnerFinancialBookingInput[],
  now = new Date(),
): OwnerFinancialSummary {
  const asOfDay = londonYmd(now);
  const weekRange = londonWeekRangeContaining(asOfDay);
  const monthRange = londonMonthRangeContaining(asOfDay);
  const yearRange = londonYearRangeContaining(asOfDay);

  const week = emptyBucket(
    "week",
    "This week",
    weekRange.fromDay,
    weekRange.toDay,
    "bookings",
  );
  const month = emptyBucket(
    "month",
    "This month",
    monthRange.fromDay,
    monthRange.toDay,
    "bookings",
  );
  const year = emptyBucket(
    "year",
    "This year",
    yearRange.fromDay,
    yearRange.toDay,
    "bookings",
  );
  const refunds = emptyBucket(
    "refunds",
    "Refunds",
    monthRange.fromDay,
    monthRange.toDay,
    "refunds",
  );

  const byRef = new Map<string, OwnerFinancialBookingInput>();
  for (const booking of bookings) {
    const ref = booking.paymentReference?.trim();
    if (!ref) continue;
    if (!isGenuinePaidFinancialBooking(booking)) continue;
    if (!byRef.has(ref)) byRef.set(ref, booking);
  }

  const lineItems = [...byRef.values()]
    .map(toFinancialLineItem)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  for (const item of lineItems) {
    const booking = byRef.get(item.paymentReference)!;
    if (dayInInclusiveRange(item.paymentDay, week.fromDay, week.toDay)) {
      week.total = roundGbp(week.total + item.netAmount);
      week.count += 1;
      week.items.push(item);
    }
    if (dayInInclusiveRange(item.paymentDay, month.fromDay, month.toDay)) {
      month.total = roundGbp(month.total + item.netAmount);
      month.count += 1;
      month.items.push(item);
    }
    if (dayInInclusiveRange(item.paymentDay, year.fromDay, year.toDay)) {
      year.total = roundGbp(year.total + item.netAmount);
      year.count += 1;
      year.items.push(item);
    }

    const refundInMonth = refundAmountInPeriod(
      booking,
      refunds.fromDay,
      refunds.toDay,
    );
    if (refundInMonth.amount > 0.001) {
      refunds.total = roundGbp(refunds.total + refundInMonth.amount);
      refunds.count += refundInMonth.opCount;
      refunds.items.push({
        ...item,
        amountRefunded: refundInMonth.amount,
        netAmount: item.netAmount,
        refundStatusLabel: item.refundStatusLabel,
      });
    }
  }

  return { asOfDay, week, month, year, refunds };
}

export function formatGbpAmount(amount: number): string {
  return `£${roundGbp(Math.max(0, amount)).toFixed(2)}`;
}

/** Inclusive day count from fromDay to today (capped) for KV created-day scans. */
export function daysBackFromTodayTo(
  fromDay: string,
  today = londonYmd(),
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay)) return 31;
  let count = 0;
  let cursor = today;
  while (cursor >= fromDay && count < 400) {
    count += 1;
    cursor = addDaysYmd(cursor, -1);
  }
  return Math.max(1, count);
}
