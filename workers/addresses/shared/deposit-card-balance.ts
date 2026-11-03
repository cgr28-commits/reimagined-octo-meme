/**
 * "Deposit now, balance by card later" for journeys booked well in advance.
 *
 * - Offered when pickup is at least {@link CARD_BALANCE_MIN_DAYS_AHEAD} days away.
 * - Customer pays {@link CARD_BALANCE_DEPOSIT_PERCENT}% by card today.
 * - {@link CARD_BALANCE_DUE_DAYS_BEFORE} days before pickup we email a SumUp payment link
 *   for the balance, with reminders.
 * - If still unpaid {@link CARD_BALANCE_CANCEL_DAYS_BEFORE} days before pickup, the booking
 *   is cancelled automatically and the deposit is kept.
 *
 * The Worker is authoritative: browser-sent amounts are ignored and recalculated.
 * The balance is always worked out from the live booking (fare − card money collected),
 * so customer amendments that change the fare are reflected automatically.
 */

import { formatGbpAmountExact, gbpToPence, penceToGbp, roundGbp } from "./gbp";
import { formatUkDateTime, parseLondonLocalDateTime } from "./uk-time";

export const PAYMENT_METHOD_DEPOSIT_CARD_BALANCE = "DEPOSIT_CARD_BALANCE" as const;

export const CARD_BALANCE_DEPOSIT_PERCENT = 20;
export const CARD_BALANCE_MIN_DAYS_AHEAD = 30;
export const CARD_BALANCE_DUE_DAYS_BEFORE = 7;
export const CARD_BALANCE_CANCEL_DAYS_BEFORE = 3;
/** Second reminder this many days before pickup (between the due date and cancellation). */
export const CARD_BALANCE_REMINDER_DAYS_BEFORE = 5;
/** Final warning this many days before pickup (the day before cancellation). */
export const CARD_BALANCE_FINAL_WARNING_DAYS_BEFORE = 4;
/** Smallest fare we offer a deposit on. */
export const CARD_BALANCE_MIN_FARE_GBP = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CardBalanceStatus = "scheduled" | "link_sent" | "paid" | "cancelled_unpaid" | "refunded";

/** Stored on the paid booking. Money figures are snapshots; the live balance is recomputed. */
export type CardBalanceState = {
  status: CardBalanceStatus;
  depositPercentUsed: number;
  /** Balance at booking time (for audit only). */
  balanceAtBookingGbp: number;
  /** Secret in the customer's pay link. */
  payToken?: string;
  checkoutId?: string;
  checkoutReference?: string;
  paymentUrl?: string;
  /** Amount of the current SumUp balance checkout. */
  checkoutAmountGbp?: number;
  linkSentAt?: string;
  reminderSentAt?: string;
  finalWarningSentAt?: string;
  paidAt?: string;
  paidAmountGbp?: number;
  transactionId?: string;
  transactionCode?: string;
  cancelledAt?: string;
  refundedAt?: string;
  refundedAmountGbp?: number;
  lastError?: string;
};

export type CardBalanceQuote = {
  eligible: boolean;
  totalFare: number;
  depositGbp: number;
  balanceGbp: number;
  percentUsed: number;
};

export function isDepositCardBalancePaymentMethod(value: unknown): boolean {
  return value === PAYMENT_METHOD_DEPOSIT_CARD_BALANCE;
}

export function pickupInstant(tripDate?: string | null, tripTime?: string | null): Date | null {
  if (!tripDate || !tripTime) return null;
  return parseLondonLocalDateTime(String(tripDate), String(tripTime).slice(0, 5));
}

/** True when the pickup is far enough away to offer a deposit. */
export function isCardBalanceDateEligible(
  tripDate: string | null | undefined,
  tripTime: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const pickup = pickupInstant(tripDate, tripTime);
  if (!pickup) return false;
  return pickup.getTime() - now.getTime() >= CARD_BALANCE_MIN_DAYS_AHEAD * DAY_MS;
}

/** 20% deposit (to the penny), balance = the rest. */
export function calculateCardBalanceQuote(finalFareGbp: number): CardBalanceQuote {
  const totalFare = roundGbp(finalFareGbp);
  const percentUsed = CARD_BALANCE_DEPOSIT_PERCENT;
  if (!Number.isFinite(totalFare) || totalFare < CARD_BALANCE_MIN_FARE_GBP) {
    return { eligible: false, totalFare, depositGbp: 0, balanceGbp: 0, percentUsed };
  }
  const totalPence = gbpToPence(totalFare);
  // Whole-pound deposit keeps both figures tidy; the balance keeps any pence.
  const depositPence = Math.max(100, Math.round((totalPence * percentUsed) / 100 / 100) * 100);
  const balancePence = totalPence - depositPence;
  return {
    eligible: balancePence >= 100 && depositPence < totalPence,
    totalFare,
    depositGbp: penceToGbp(depositPence),
    balanceGbp: penceToGbp(balancePence),
    percentUsed,
  };
}

export type CardBalanceSchedule = {
  pickupAt: Date;
  dueAt: Date;
  reminderAt: Date;
  finalWarningAt: Date;
  cancelAt: Date;
};

export function cardBalanceSchedule(
  tripDate: string | null | undefined,
  tripTime: string | null | undefined,
): CardBalanceSchedule | null {
  const pickupAt = pickupInstant(tripDate, tripTime);
  if (!pickupAt) return null;
  const before = (days: number) => new Date(pickupAt.getTime() - days * DAY_MS);
  return {
    pickupAt,
    dueAt: before(CARD_BALANCE_DUE_DAYS_BEFORE),
    reminderAt: before(CARD_BALANCE_REMINDER_DAYS_BEFORE),
    finalWarningAt: before(CARD_BALANCE_FINAL_WARNING_DAYS_BEFORE),
    cancelAt: before(CARD_BALANCE_CANCEL_DAYS_BEFORE),
  };
}

/** UK local date + time label, e.g. "Sun 6 Jun 2027, 15:15". */
export function formatUkInstant(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return formatUkDateTime(`${get("year")}-${get("month")}-${get("day")}`, `${get("hour")}:${get("minute")}`);
}

/** Calendar date only, e.g. "Sunday 6 June 2027". */
export function formatUkDateLong(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Customer copy: when the balance is requested, from the pickup date/time. */
export function cardBalanceDueDateLabel(tripDate?: string | null, tripTime?: string | null): string {
  const schedule = cardBalanceSchedule(tripDate, tripTime);
  return schedule ? formatUkDateLong(schedule.dueAt) : `${CARD_BALANCE_DUE_DAYS_BEFORE} days before your journey`;
}

export const CARD_BALANCE_OPTION_LABEL = "Pay a deposit";
export const CARD_BALANCE_BADGE = `${CARD_BALANCE_DEPOSIT_PERCENT}% today`;

export function cardBalanceOptionSubline(balanceGbp: number): string {
  return `${formatGbpAmountExact(balanceGbp)} by card ${CARD_BALANCE_DUE_DAYS_BEFORE} days before`;
}

export function cardBalanceExplainer(balanceGbp: number, dueDateLabel: string): string {
  return (
    `We'll email you a secure card payment link for the remaining ${formatGbpAmountExact(balanceGbp)} on ${dueDateLabel} ` +
    `(${CARD_BALANCE_DUE_DAYS_BEFORE} days before your journey). If it isn't paid ${CARD_BALANCE_CANCEL_DAYS_BEFORE} days before pickup, ` +
    `the booking is cancelled and the deposit is kept. Cancel 24 hours or more before pickup for a full refund.`
  );
}

export function cardBalanceAgreementLabel(balanceGbp: number): string {
  return (
    `I understand the remaining ${formatGbpAmountExact(balanceGbp)} must be paid by card ${CARD_BALANCE_DUE_DAYS_BEFORE} days before my journey, ` +
    `and that the booking is cancelled (deposit kept) if it isn't paid ${CARD_BALANCE_CANCEL_DAYS_BEFORE} days before pickup.`
  );
}

export const CARD_BALANCE_AGREEMENT_REQUIRED_MESSAGE =
  "Please confirm you understand when the remaining balance is due.";

export function cardBalancePayButtonLabel(depositGbp: number): string {
  return `Pay ${formatGbpAmountExact(depositGbp)} Deposit & Confirm Booking`;
}

/**
 * Balance still owed by card on a deposit booking: journey fare minus card money
 * collected (deposit + any top-ups/balance), never negative.
 */
export function remainingCardBalanceGbp(record: {
  paymentMethod?: string | null;
  amount?: number | null;
  totalFare?: number | null;
  originalAmount?: number | null;
  onlineAmountPaid?: number | null;
  additionalPayments?: Array<{ amount?: number | null }> | null;
  cardBalance?: Pick<CardBalanceState, "status" | "paidAmountGbp"> | null;
}): number {
  if (!isDepositCardBalancePaymentMethod(record.paymentMethod)) return 0;
  const state = record.cardBalance;
  if (state && state.status !== "scheduled" && state.status !== "link_sent") return 0;
  const fare = Number(record.amount ?? record.totalFare);
  if (!(fare > 0)) return 0;
  const deposit = Number(record.originalAmount ?? record.onlineAmountPaid);
  const extra = (record.additionalPayments ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const collected = (Number.isFinite(deposit) ? deposit : 0) + extra;
  return Math.max(0, roundGbp(fare - collected));
}

export function cardBalanceOwnerStatusLine(record: {
  paymentMethod?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
  amount?: number | null;
  totalFare?: number | null;
  originalAmount?: number | null;
  onlineAmountPaid?: number | null;
  additionalPayments?: Array<{ amount?: number | null }> | null;
  cardBalance?: CardBalanceState | null;
}): string | null {
  if (!isDepositCardBalancePaymentMethod(record.paymentMethod)) return null;
  const state = record.cardBalance;
  const due = remainingCardBalanceGbp(record);
  const schedule = cardBalanceSchedule(record.tripDate, record.tripTime);
  switch (state?.status) {
    case "paid":
      return `Card balance paid${state.paidAmountGbp ? ` (${formatGbpAmountExact(state.paidAmountGbp)})` : ""}`;
    case "refunded":
      return `Card balance refunded${state.refundedAmountGbp ? ` (${formatGbpAmountExact(state.refundedAmountGbp)})` : ""}`;
    case "cancelled_unpaid":
      return "Cancelled — card balance not paid (deposit kept)";
    case "link_sent":
      return `Card balance ${formatGbpAmountExact(due)} — payment link sent${schedule ? `, cancels ${formatUkInstant(schedule.cancelAt)} if unpaid` : ""}`;
    default:
      return `Card balance ${formatGbpAmountExact(due)} — link emailed ${schedule ? formatUkInstant(schedule.dueAt) : `${CARD_BALANCE_DUE_DAYS_BEFORE} days before`}`;
  }
}
