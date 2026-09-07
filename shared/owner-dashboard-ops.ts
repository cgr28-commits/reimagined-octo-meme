/**
 * Owner-dashboard operational grouping and earned-revenue vs payments-received
 * metrics. Customer booking/payment flows are unchanged; this is display +
 * reporting only.
 *
 * Week: Monday 00:00 through Sunday 23:59 Europe/London
 * (existing londonWeekRangeContaining).
 */

import {
  dayInInclusiveRange,
  londonMonthRangeContaining,
  londonPaymentDay,
  londonWeekRangeContaining,
} from "./owner-financial-summary";
import { addDaysYmd, londonYmd } from "./upcoming-jobs";

export type OwnerJourneyLeg = "outbound" | "return";

export type OwnerOpsAdditionalPayment = {
  amount?: number;
  paidAt?: string;
  createdAt?: string;
};

/** Paid-booking fields the owner dashboard needs for ops / revenue. */
export type OwnerOpsPaidBooking = {
  paymentReference: string;
  createdAt: string;
  status?: string;
  operationalStatus?: string;
  customerName?: string;
  customerEmail?: string;
  mobileNumber?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  amount?: number;
  amountPaid?: string;
  amountPaidLabel?: string;
  originalAmount?: number;
  outboundFare?: number | null;
  returnFare?: number | null;
  outboundCompletedAt?: string;
  returnCompletedAt?: string;
  outboundJourneyStatus?: string;
  returnJourneyStatus?: string;
  journeyStatus?: string;
  journeyCompletedAt?: string;
  allLegsCompleted?: boolean;
  nextUnfinishedLegDate?: string;
  additionalPayments?: OwnerOpsAdditionalPayment[];
  quoteSnapshot?: Record<string, unknown> | null;
  cancelledAt?: string;
  expressDropOffFee?: number | null;
  airportAccessChargeGbp?: number | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
  airportFixedCostsGbp?: number | null;
};

export type OwnerOpsBookingJob = {
  id: string;
  status: string;
  tripDate?: string;
  tripTime?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  customerName?: string;
  customerEmail?: string;
  customerMobile?: string;
  quotedPrice?: string | null;
  amountPaidLabel?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
};

export type OwnerOpsLeg = {
  bookingId: string;
  reference: string;
  source: "paid" | "booking_job";
  leg: OwnerJourneyLeg;
  isReturnBooking: boolean;
  scheduledDate: string;
  scheduledTime: string;
  pickup: string;
  dropoff: string;
  customerName: string;
  paymentStatus: string;
  journeyStatus: string;
  completedAt: string;
  fareGbp: number | null;
  fareKnown: boolean;
  bookingAmountGbp: number;
  awaitingPayment: boolean;
  cancelled: boolean;
  completed: boolean;
};

export type OwnerDateGroup<T> = {
  date: string;
  label: string;
  count: number;
  items: T[];
  earnedGbp?: number;
};

export type OwnerOperationalPeriodMetrics = {
  journeysScheduled: number;
  journeysCompleted: number;
  earnedRevenueGbp: number;
  paymentsReceivedGbp: number;
};

export type OwnerOperationalMetrics = {
  today: OwnerOperationalPeriodMetrics;
  week: OwnerOperationalPeriodMetrics;
  month: OwnerOperationalPeriodMetrics;
  unsplitReturnBookingIds: string[];
  allocationTraces: Array<OwnerLegFareAllocationExplain & { bookingId: string }>;
};

export type OwnerAwaitingPaymentRef = {
  id: string;
  source: "paid" | "booking_job";
  reference: string;
  label: string;
  date: string;
  today: boolean;
};

const CANCELLED = new Set(["cancelled", "canceled", "expired"]);
const COMPLETED = new Set(["completed"]);
const AWAITING_PAYMENT = new Set(["awaiting_payment", "unpaid", "pending_payment"]);

function roundGbp(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

function parsePounds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function ownerOpsTodayDate(now: Date | number = new Date()): string {
  return londonYmd(typeof now === "number" ? new Date(now) : now);
}

export function formatOwnerOpsDateLabel(isoDate: string, today = ownerOpsTodayDate()): string {
  const key = String(isoDate || "").slice(0, 10);
  if (!key) return "Unknown date";
  if (key === today) return "Today";
  const parsed = Date.parse(`${key}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return key;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(parsed));
}

export function isOwnerOpsCancelledStatus(status: string | undefined): boolean {
  return CANCELLED.has(String(status || "").trim().toLowerCase());
}

export function isOwnerOpsCompletedStatus(status: string | undefined): boolean {
  return COMPLETED.has(String(status || "").trim().toLowerCase());
}

export function isOwnerOpsAwaitingPaymentStatus(status: string | undefined): boolean {
  return AWAITING_PAYMENT.has(String(status || "").trim().toLowerCase());
}

export function paidBookingIsCancelled(booking: OwnerOpsPaidBooking): boolean {
  return (
    isOwnerOpsCancelledStatus(booking.status) ||
    isOwnerOpsCancelledStatus(booking.operationalStatus) ||
    Boolean(booking.cancelledAt?.trim())
  );
}

function firstPositiveGbp(...values: unknown[]): number {
  for (const value of values) {
    const amount = parseOwnerMoneyGbp(value);
    if (amount > 0) return amount;
  }
  return 0;
}

/** Parse £129.40 / 129.4 / "129.40" without inventing a value. */
export function parseOwnerMoneyGbp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return roundGbp(value);
  }
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const amount = Number(match[0]);
  return Number.isFinite(amount) && amount >= 0 ? roundGbp(amount) : 0;
}

function amountsNearlyEqual(a: number, b: number, toleranceGbp = 0.02): boolean {
  return Math.abs(roundGbp(a) - roundGbp(b)) <= toleranceGbp;
}

export type OwnerAirportChargeBreakdown = {
  outboundAirportChargesGbp: number;
  returnAirportChargesGbp: number;
  combinedAirportChargesGbp: number;
  airportChargesUsedGbp: number;
};

/**
 * Airport pass-through charges from the actual booking record.
 * Prefers explicit per-leg access charges; otherwise one combined access/express
 * fee. Fixed airport costs are added only when stored separately.
 * Never sums the same charge twice. Never uses example/default fees.
 */
export function ownerAirportChargeBreakdown(booking: {
  expressDropOffFee?: number | null;
  airportAccessChargeGbp?: number | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
  airportFixedCostsGbp?: number | null;
  quoteSnapshot?: Record<string, unknown> | null;
}): OwnerAirportChargeBreakdown {
  const snap = booking.quoteSnapshot || {};
  const outboundAirportChargesGbp = firstPositiveGbp(
    booking.outboundAirportAccessChargeGbp,
    snap.outboundAirportAccessChargeGbp,
  );
  const returnAirportChargesGbp = firstPositiveGbp(
    booking.returnAirportAccessChargeGbp,
    snap.returnAirportAccessChargeGbp,
  );
  const perLegAccess = roundGbp(outboundAirportChargesGbp + returnAirportChargesGbp);
  const combinedAirportChargesGbp = firstPositiveGbp(
    booking.airportAccessChargeGbp,
    booking.expressDropOffFee,
    snap.airportAccessChargeGbp,
    snap.expressDropOffFee,
  );
  const access = perLegAccess > 0 ? perLegAccess : combinedAirportChargesGbp;
  const fixed = firstPositiveGbp(booking.airportFixedCostsGbp, snap.airportFixedCostsGbp);
  return {
    outboundAirportChargesGbp,
    returnAirportChargesGbp,
    combinedAirportChargesGbp,
    airportChargesUsedGbp: roundGbp(access + fixed),
  };
}

export function ownerAirportPassThroughChargesGbp(booking: {
  expressDropOffFee?: number | null;
  airportAccessChargeGbp?: number | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
  airportFixedCostsGbp?: number | null;
  quoteSnapshot?: Record<string, unknown> | null;
}): number {
  return ownerAirportChargeBreakdown(booking).airportChargesUsedGbp;
}

export type OwnerCustomerTotalCandidates = {
  originalAmount: number;
  amountPaid: number;
  snapshotPayable: number;
  agreedAmount: number;
};

/**
 * Actual customer return-booking total (money paid / owed), not a one-way
 * agreed-fare leftover. Prefers original collected amount + top-ups, then the
 * paid label, then quote payable, then `amount`.
 */
export function resolveOwnerCustomerTotalGbp(booking: {
  amount?: number | string | null;
  amountPaid?: string | number | null;
  amountPaidLabel?: string | null;
  originalAmount?: number | string | null;
  additionalPayments?: OwnerOpsAdditionalPayment[];
  quoteSnapshot?: Record<string, unknown> | null;
}): { totalGbp: number; candidates: OwnerCustomerTotalCandidates } {
  const snap = booking.quoteSnapshot || {};
  const candidates: OwnerCustomerTotalCandidates = {
    originalAmount: parseOwnerMoneyGbp(booking.originalAmount),
    amountPaid: parseOwnerMoneyGbp(booking.amountPaid ?? booking.amountPaidLabel),
    snapshotPayable: firstPositiveGbp(
      snap.finalAmountPayableGbp,
      snap.totalGbp,
      snap.quotedAmount,
      snap.amount,
    ),
    agreedAmount: parseOwnerMoneyGbp(booking.amount),
  };
  const extras = roundGbp(
    (booking.additionalPayments || []).reduce(
      (sum, entry) => sum + parseOwnerMoneyGbp(entry.amount),
      0,
    ),
  );
  const collected =
    candidates.originalAmount > 0
      ? roundGbp(candidates.originalAmount + extras)
      : 0;
  // Historic records can keep a stale smaller original/agreed figure beside
  // the real paid label / quote payable. Use the largest payment-like value.
  const paymentLike = Math.max(
    collected,
    candidates.amountPaid,
    candidates.snapshotPayable,
  );
  const totalGbp = firstPositiveGbp(paymentLike, candidates.agreedAmount);
  return { totalGbp, candidates };
}

export function ownerJourneyFareAfterAirportChargesGbp(booking: {
  amount?: number | string | null;
  amountPaid?: string | number | null;
  amountPaidLabel?: string | null;
  originalAmount?: number | string | null;
  additionalPayments?: OwnerOpsAdditionalPayment[];
  expressDropOffFee?: number | null;
  airportAccessChargeGbp?: number | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
  airportFixedCostsGbp?: number | null;
  quoteSnapshot?: Record<string, unknown> | null;
}): number {
  return explainOwnerLegFareAllocation(booking).journeyFareAfterChargesGbp;
}

export type OwnerLegFareAllocationExplain = {
  bookingTotalUsedGbp: number;
  airportChargesUsedGbp: number;
  outboundAirportChargesGbp: number;
  returnAirportChargesGbp: number;
  journeyFareAfterChargesGbp: number;
  outboundAllocatedFareGbp: number | null;
  returnAllocatedFareGbp: number | null;
  source: "stored" | "snapshot" | "allocated" | "one_way";
  totalCandidates: OwnerCustomerTotalCandidates;
};

function storedSplitLooksValid(
  outbound: number,
  inbound: number,
  journeyFare: number,
  customerTotal: number,
): boolean {
  const sum = roundGbp(outbound + inbound);
  return amountsNearlyEqual(sum, journeyFare) || amountsNearlyEqual(sum, customerTotal);
}

/**
 * Persist/read per-leg fares in GBP from THIS booking's real values.
 * Modern bookings keep stored outbound/return fares only when they still
 * reconcile with the customer total / net journey fare.
 * Historic unsplit returns allocate (customer total − airport charges) / 2.
 */
export function explainOwnerLegFareAllocation(booking: {
  returnJourney?: boolean;
  amount?: number | string | null;
  amountPaid?: string | number | null;
  amountPaidLabel?: string | null;
  originalAmount?: number | string | null;
  additionalPayments?: OwnerOpsAdditionalPayment[];
  outboundFare?: number | null;
  returnFare?: number | null;
  quoteSnapshot?: Record<string, unknown> | null;
  expressDropOffFee?: number | null;
  airportAccessChargeGbp?: number | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
  airportFixedCostsGbp?: number | null;
}): OwnerLegFareAllocationExplain {
  const { totalGbp, candidates } = resolveOwnerCustomerTotalGbp(booking);
  const charges = ownerAirportChargeBreakdown(booking);
  const agreed = candidates.agreedAmount;
  const journeyAlreadyExcludesCharges =
    charges.airportChargesUsedGbp > 0 &&
    agreed > 0 &&
    agreed < totalGbp &&
    amountsNearlyEqual(agreed + charges.airportChargesUsedGbp, totalGbp);
  const journeyFareAfterChargesGbp = journeyAlreadyExcludesCharges
    ? agreed
    : roundGbp(Math.max(0, totalGbp - charges.airportChargesUsedGbp));

  const base = {
    bookingTotalUsedGbp: totalGbp,
    airportChargesUsedGbp: charges.airportChargesUsedGbp,
    outboundAirportChargesGbp: charges.outboundAirportChargesGbp,
    returnAirportChargesGbp: charges.returnAirportChargesGbp,
    journeyFareAfterChargesGbp,
    totalCandidates: candidates,
  };

  if (!booking.returnJourney) {
    return {
      ...base,
      outboundAllocatedFareGbp: journeyFareAfterChargesGbp,
      returnAllocatedFareGbp: null,
      source: "one_way",
    };
  }

  const persistedOut = parseOwnerMoneyGbp(booking.outboundFare);
  const persistedRet = parseOwnerMoneyGbp(booking.returnFare);
  if (
    persistedOut > 0 &&
    persistedRet > 0 &&
    storedSplitLooksValid(persistedOut, persistedRet, journeyFareAfterChargesGbp, totalGbp)
  ) {
    return {
      ...base,
      outboundAllocatedFareGbp: persistedOut,
      returnAllocatedFareGbp: persistedRet,
      source: "stored",
    };
  }

  const snap = booking.quoteSnapshot || {};
  const snapOut = parseOwnerMoneyGbp(snap.outboundAmount ?? snap.outboundFare ?? snap.outboundPrice);
  const snapRet = parseOwnerMoneyGbp(snap.returnAmount ?? snap.returnFare ?? snap.returnPrice);
  if (
    snapOut > 0 &&
    snapRet > 0 &&
    storedSplitLooksValid(snapOut, snapRet, journeyFareAfterChargesGbp, totalGbp)
  ) {
    return {
      ...base,
      outboundAllocatedFareGbp: snapOut,
      returnAllocatedFareGbp: snapRet,
      source: "snapshot",
    };
  }

  const outboundAllocatedFareGbp = roundGbp(journeyFareAfterChargesGbp / 2);
  const returnAllocatedFareGbp = roundGbp(journeyFareAfterChargesGbp - outboundAllocatedFareGbp);
  return {
    ...base,
    outboundAllocatedFareGbp,
    returnAllocatedFareGbp,
    source: "allocated",
  };
}

export function allocateOwnerLegFares(booking: {
  returnJourney?: boolean;
  amount?: number | string | null;
  amountPaid?: string | number | null;
  amountPaidLabel?: string | null;
  originalAmount?: number | string | null;
  additionalPayments?: OwnerOpsAdditionalPayment[];
  outboundFare?: number | null;
  returnFare?: number | null;
  quoteSnapshot?: Record<string, unknown> | null;
  expressDropOffFee?: number | null;
  airportAccessChargeGbp?: number | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
  airportFixedCostsGbp?: number | null;
}): {
  outboundFare: number | null;
  returnFare: number | null;
  splitKnown: boolean;
  allocated: boolean;
  explain: OwnerLegFareAllocationExplain;
} {
  const explain = explainOwnerLegFareAllocation(booking);
  return {
    outboundFare: explain.outboundAllocatedFareGbp,
    returnFare: explain.returnAllocatedFareGbp,
    splitKnown: explain.outboundAllocatedFareGbp != null,
    allocated: explain.source === "allocated",
    explain,
  };
}

/** Persist both leg fares only when both known values are positive. */
export function persistableLegFares(input: {
  returnJourney?: boolean;
  outboundFare?: number | null;
  returnFare?: number | null;
  outboundAmount?: number | null;
  returnAmount?: number | null;
}): { outboundFare: number; returnFare: number } | null {
  if (!input.returnJourney) return null;
  const outbound = Number(input.outboundFare ?? input.outboundAmount);
  const inbound = Number(input.returnFare ?? input.returnAmount);
  if (!(outbound > 0) || !(inbound > 0)) return null;
  return { outboundFare: roundGbp(outbound), returnFare: roundGbp(inbound) };
}

export function expandOwnerPaidBookingLegs(booking: OwnerOpsPaidBooking): OwnerOpsLeg[] {
  const fares = allocateOwnerLegFares({
    returnJourney: booking.returnJourney,
    amount: booking.amount,
    amountPaid: booking.amountPaid,
    amountPaidLabel: booking.amountPaidLabel,
    originalAmount: booking.originalAmount,
    additionalPayments: booking.additionalPayments,
    outboundFare: booking.outboundFare,
    returnFare: booking.returnFare,
    quoteSnapshot: booking.quoteSnapshot,
    expressDropOffFee: booking.expressDropOffFee,
    airportAccessChargeGbp: booking.airportAccessChargeGbp,
    outboundAirportAccessChargeGbp: booking.outboundAirportAccessChargeGbp,
    returnAirportAccessChargeGbp: booking.returnAirportAccessChargeGbp,
    airportFixedCostsGbp: booking.airportFixedCostsGbp,
  });
  const cancelled = paidBookingIsCancelled(booking);
  const awaitingPayment = isOwnerOpsAwaitingPaymentStatus(booking.status);
  const outboundCompleted =
    isOwnerOpsCompletedStatus(booking.outboundJourneyStatus) ||
    (!booking.returnJourney &&
      (isOwnerOpsCompletedStatus(booking.journeyStatus) || Boolean(booking.allLegsCompleted)));
  const returnCompleted =
    Boolean(booking.returnJourney) &&
    (isOwnerOpsCompletedStatus(booking.returnJourneyStatus) ||
      (Boolean(booking.allLegsCompleted) && outboundCompleted));

  const outbound: OwnerOpsLeg = {
    bookingId: booking.paymentReference,
    reference: booking.paymentReference,
    source: "paid",
    leg: "outbound",
    isReturnBooking: Boolean(booking.returnJourney),
    scheduledDate: String(booking.tripDate || "").slice(0, 10),
    scheduledTime: String(booking.tripTime || ""),
    pickup: booking.pickupLabel || "",
    dropoff: booking.dropoffLabel || "",
    customerName: booking.customerName || "",
    paymentStatus: booking.status || "",
    journeyStatus: booking.outboundJourneyStatus || booking.journeyStatus || (outboundCompleted ? "completed" : "scheduled"),
    completedAt: booking.outboundCompletedAt || (!booking.returnJourney ? booking.journeyCompletedAt || "" : ""),
    fareGbp: fares.outboundFare,
    fareKnown: fares.splitKnown,
    bookingAmountGbp: Number(booking.amount) || parsePounds(booking.amountPaid),
    awaitingPayment,
    cancelled,
    completed: outboundCompleted,
  };

  if (!booking.returnJourney) return [outbound];

  return [
    outbound,
    {
      bookingId: booking.paymentReference,
      reference: booking.paymentReference,
      source: "paid",
      leg: "return",
      isReturnBooking: true,
      scheduledDate: String(booking.returnDate || booking.tripDate || "").slice(0, 10),
      scheduledTime: String(booking.returnTime || ""),
      pickup: booking.dropoffLabel || "",
      dropoff: booking.pickupLabel || "",
      customerName: booking.customerName || "",
      paymentStatus: booking.status || "",
      journeyStatus: booking.returnJourneyStatus || (returnCompleted ? "completed" : "scheduled"),
      completedAt: booking.returnCompletedAt || "",
      fareGbp: fares.returnFare,
      fareKnown: fares.splitKnown,
      bookingAmountGbp: outbound.bookingAmountGbp,
      awaitingPayment,
      cancelled,
      completed: returnCompleted,
    },
  ];
}

export function expandOwnerBookingJobLegs(job: OwnerOpsBookingJob): OwnerOpsLeg[] {
  const cancelled = isOwnerOpsCancelledStatus(job.status);
  const awaitingPayment = isOwnerOpsAwaitingPaymentStatus(job.status);
  const amount = parsePounds(job.amountPaidLabel || job.quotedPrice);
  const hasReturn = Boolean(job.returnJourney || String(job.returnDate || "").trim());
  const outbound: OwnerOpsLeg = {
    bookingId: job.id,
    reference: job.id,
    source: "booking_job",
    leg: "outbound",
    isReturnBooking: hasReturn,
    scheduledDate: String(job.tripDate || "").slice(0, 10),
    scheduledTime: String(job.tripTime || ""),
    pickup: job.pickupLabel || "",
    dropoff: job.dropoffLabel || "",
    customerName: job.customerName || "",
    paymentStatus: job.status,
    journeyStatus: job.status,
    completedAt: "",
    fareGbp: hasReturn ? null : roundGbp(amount),
    fareKnown: !hasReturn,
    bookingAmountGbp: amount,
    awaitingPayment,
    cancelled,
    completed: false,
  };
  if (!hasReturn) return [outbound];
  return [
    outbound,
    {
      ...outbound,
      leg: "return",
      scheduledDate: String(job.returnDate || "").slice(0, 10),
      scheduledTime: String(job.returnTime || ""),
      pickup: job.dropoffLabel || "",
      dropoff: job.pickupLabel || "",
      fareGbp: null,
      fareKnown: false,
    },
  ];
}

export function ownerOpsCompletionDay(leg: OwnerOpsLeg): string {
  if (leg.completedAt?.trim()) return londonPaymentDay(leg.completedAt);
  return String(leg.scheduledDate || "").slice(0, 10);
}

export function ownerOpsPickupKey(leg: OwnerOpsLeg): string {
  const time = String(leg.scheduledTime || "99:99").padStart(5, "0");
  return `${leg.scheduledDate}T${time}`;
}

export function selectTodayUpcomingLegs(legs: OwnerOpsLeg[], today = ownerOpsTodayDate()): OwnerOpsLeg[] {
  return legs
    .filter((leg) => !leg.cancelled && !leg.completed && leg.scheduledDate === today)
    .sort((a, b) => ownerOpsPickupKey(a).localeCompare(ownerOpsPickupKey(b)) || a.reference.localeCompare(b.reference));
}

export function selectTodayCompletedLegs(legs: OwnerOpsLeg[], today = ownerOpsTodayDate()): OwnerOpsLeg[] {
  return legs
    .filter((leg) => !leg.cancelled && leg.completed && ownerOpsCompletionDay(leg) === today)
    .sort((a, b) => ownerOpsPickupKey(a).localeCompare(ownerOpsPickupKey(b)) || a.reference.localeCompare(b.reference));
}

export function groupFutureJobsByDate(legs: OwnerOpsLeg[], today = ownerOpsTodayDate()): OwnerDateGroup<OwnerOpsLeg>[] {
  const groups = new Map<string, OwnerOpsLeg[]>();
  for (const leg of legs) {
    if (leg.cancelled || leg.completed) continue;
    const date = String(leg.scheduledDate || "").slice(0, 10);
    if (!date || date <= today) continue;
    const list = groups.get(date) || [];
    list.push(leg);
    groups.set(date, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: formatOwnerOpsDateLabel(date, today),
      count: items.length,
      items: items.sort((a, b) => ownerOpsPickupKey(a).localeCompare(ownerOpsPickupKey(b)) || a.reference.localeCompare(b.reference)),
    }));
}

/**
 * Earned revenue for a calendar day.
 * Each completed journey leg contributes its own fare on its completion day.
 * Historic return bookings without stored outbound/return fares use the
 * allocated half of (customer total − airport charges) per completed leg.
 */
export function earnedRevenueOnDay(allLegs: OwnerOpsLeg[], day: string): number {
  const completed = allLegs.filter((leg) => !leg.cancelled && leg.completed && leg.source === "paid");
  let earned = 0;
  for (const leg of completed) {
    if (ownerOpsCompletionDay(leg) !== day) continue;
    earned = roundGbp(earned + (Number(leg.fareGbp) || 0));
  }
  return earned;
}

export function groupCompletedJobsByDate(legs: OwnerOpsLeg[], today = ownerOpsTodayDate()): OwnerDateGroup<OwnerOpsLeg>[] {
  const groups = new Map<string, OwnerOpsLeg[]>();
  for (const leg of legs) {
    if (leg.cancelled || !leg.completed || leg.source !== "paid") continue;
    const date = ownerOpsCompletionDay(leg);
    if (!date) continue;
    const list = groups.get(date) || [];
    list.push(leg);
    groups.set(date, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      label: formatOwnerOpsDateLabel(date, today),
      count: items.length,
      items: items.sort((a, b) => ownerOpsPickupKey(b).localeCompare(ownerOpsPickupKey(a)) || a.reference.localeCompare(b.reference)),
      earnedGbp: earnedRevenueOnDay(legs, date),
    }));
}

export function paymentsReceivedOnDay(bookings: OwnerOpsPaidBooking[], day: string): number {
  let received = 0;
  for (const booking of bookings) {
    if (paidBookingIsCancelled(booking) && String(booking.status || "").toLowerCase() !== "refunded_active") {
      // Cancelled unpaid records contribute nothing. Paid-then-cancelled still
      // received money on the payment day — count that receipt.
    }
    const paidLike = !isOwnerOpsAwaitingPaymentStatus(booking.status)
      && String(booking.status || "").toLowerCase() !== "pending"
      && String(booking.status || "").toLowerCase() !== "failed"
      && String(booking.status || "").toLowerCase() !== "abandoned";
    const createdDay = londonPaymentDay(booking.createdAt);
    if (paidLike && createdDay === day) {
      received = roundGbp(received + (Number(booking.amount) || parsePounds(booking.amountPaid)));
    }
    for (const extra of booking.additionalPayments || []) {
      const extraDay = londonPaymentDay(extra.paidAt || extra.createdAt);
      if (extraDay === day) received = roundGbp(received + (Number(extra.amount) || 0));
    }
  }
  return received;
}

export function paymentsReceivedInDayRange(
  bookings: OwnerOpsPaidBooking[],
  fromDay: string,
  toDay: string,
): number {
  let received = 0;
  let cursor = fromDay;
  while (cursor <= toDay) {
    received = roundGbp(received + paymentsReceivedOnDay(bookings, cursor));
    if (cursor === toDay) break;
    cursor = addDaysYmd(cursor, 1);
    if (cursor > toDay) break;
  }
  return received;
}

export function selectAwaitingPaymentItems(input: {
  paidBookings: OwnerOpsPaidBooking[];
  bookingJobs?: OwnerOpsBookingJob[];
  today?: string;
}): OwnerAwaitingPaymentRef[] {
  const today = input.today || ownerOpsTodayDate();
  const items: OwnerAwaitingPaymentRef[] = [];

  for (const booking of input.paidBookings) {
    if (paidBookingIsCancelled(booking)) continue;
    if (!isOwnerOpsAwaitingPaymentStatus(booking.status)) continue;
    const date = String(booking.nextUnfinishedLegDate || booking.tripDate || "").slice(0, 10);
    items.push({
      id: booking.paymentReference,
      source: "paid",
      reference: booking.paymentReference,
      label: `${booking.pickupLabel || "Pickup"} → ${booking.dropoffLabel || "Drop-off"}`,
      date,
      today: date === today,
    });
  }

  for (const job of input.bookingJobs || []) {
    if (isOwnerOpsCancelledStatus(job.status)) continue;
    if (!isOwnerOpsAwaitingPaymentStatus(job.status)) continue;
    const date = String(job.tripDate || "").slice(0, 10);
    items.push({
      id: job.id,
      source: "booking_job",
      reference: job.id,
      label: `${job.pickupLabel || "Pickup"} → ${job.dropoffLabel || "Drop-off"}`,
      date,
      today: date === today,
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
}

function daysInInclusiveRange(fromDay: string, toDay: string): string[] {
  const days: string[] = [];
  let cursor = fromDay;
  while (cursor <= toDay) {
    days.push(cursor);
    if (cursor === toDay) break;
    cursor = addDaysYmd(cursor, 1);
  }
  return days;
}

export function buildOwnerOperationalMetrics(input: {
  paidBookings: OwnerOpsPaidBooking[];
  bookingJobs?: OwnerOpsBookingJob[];
  now?: Date;
}): OwnerOperationalMetrics {
  const now = input.now ?? new Date();
  const today = londonYmd(now);
  const weekRange = londonWeekRangeContaining(today);
  const monthRange = londonMonthRangeContaining(today);
  const paidLegs = input.paidBookings.flatMap(expandOwnerPaidBookingLegs);
  const unsplitReturnBookingIds: string[] = [];
  const allocationTraces = input.paidBookings
    .filter((booking) => booking.returnJourney)
    .map((booking) => ({
      bookingId: booking.paymentReference,
      ...explainOwnerLegFareAllocation(booking),
    }));

  const period = (fromDay: string, toDay: string): OwnerOperationalPeriodMetrics => {
    const days = daysInInclusiveRange(fromDay, toDay);
    const scheduled = paidLegs.filter((leg) => {
      if (leg.cancelled) return false;
      const date = String(leg.scheduledDate || "").slice(0, 10);
      return dayInInclusiveRange(date, fromDay, toDay);
    }).length;
    const completedLegs = paidLegs.filter(
      (leg) => !leg.cancelled && leg.completed && days.includes(ownerOpsCompletionDay(leg)),
    );
    const earned = days.reduce((sum, day) => roundGbp(sum + earnedRevenueOnDay(paidLegs, day)), 0);
    return {
      journeysScheduled: scheduled,
      journeysCompleted: completedLegs.length,
      earnedRevenueGbp: earned,
      paymentsReceivedGbp: paymentsReceivedInDayRange(input.paidBookings, fromDay, toDay),
    };
  };

  void input.bookingJobs;
  return {
    today: period(today, today),
    week: period(weekRange.fromDay, weekRange.toDay),
    month: period(monthRange.fromDay, monthRange.toDay),
    unsplitReturnBookingIds,
    allocationTraces,
  };
}

export function formatOwnerOpsMoney(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}
