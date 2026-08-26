/**
 * Shared refund / cancellation operations for paid SumUp bookings.
 * Extends the existing full-refund pipeline — does not create a second system.
 */

import { parseLondonLocalDateTime } from "./uk-time";

export const REFUND_REASON_CATEGORIES = [
  "customer_cancelled_over_24h",
  "customer_cancelled_under_24h",
  "business_cancelled",
  "goodwill",
  "service_issue",
  "fare_adjustment",
  "duplicate_incorrect_payment",
  "partial_refund_agreed",
  "other",
] as const;

export type RefundReasonCategory = (typeof REFUND_REASON_CATEGORIES)[number];

/** Reasons shown in owner UI (excludes legacy-only values kept for old audits). */
export const REFUND_REASON_UI_CATEGORIES: readonly RefundReasonCategory[] = [
  "customer_cancelled_over_24h",
  "customer_cancelled_under_24h",
  "business_cancelled",
  "goodwill",
  "fare_adjustment",
  "duplicate_incorrect_payment",
  "partial_refund_agreed",
  "other",
] as const;

export const REFUND_REASON_LABELS: Record<RefundReasonCategory, string> = {
  customer_cancelled_over_24h:
    "Customer cancelled — more than 24 hours before pickup",
  customer_cancelled_under_24h: "Customer cancelled — within 24 hours of pickup",
  business_cancelled: "Owner/service cancellation",
  goodwill: "Customer service / goodwill",
  service_issue: "Service issue",
  fare_adjustment: "Fare adjustment",
  duplicate_incorrect_payment: "Duplicate/incorrect payment",
  partial_refund_agreed: "Partial refund agreed with customer",
  other: "Other",
};

/** Consistent customer-facing refund timing (do not promise exact arrival). */
export const REFUND_FUNDS_TIMING =
  "Please allow 5–7 working days for the funds to appear in your account.";

export type RefundActionKind =
  | "cancel_full_refund"
  | "cancel_partial_refund"
  | "cancel_no_refund"
  | "partial_refund_keep_active"
  | "full_refund_keep_active"
  | "full_refund_and_cancel"
  /** Owner marks booking fully refunded after a manual SumUp refund — no payment API. */
  | "mark_external_refund";

/** Journey / calendar / tracking operational state (independent of money). */
export type OperationalBookingStatus = "confirmed" | "cancelled";

/** Card payment / SumUp refund money state (independent of journey). */
export type PaymentRefundStatus = "paid" | "partially_refunded" | "fully_refunded";

/**
 * Combined compatibility status stored on paid booking records.
 * `refunded_active` = fully refunded money but journey still confirmed.
 * `refunded` = fully refunded AND operationally cancelled (legacy cancel+refund).
 */
export type PaidBookingMoneyStatus =
  | "confirmed"
  | "partially_refunded"
  | "refunded_active"
  | "refunded"
  | "cancelled";

export type RefundOperationState =
  | "requested"
  | "processing"
  | "processor_accepted"
  | "completed"
  | "failed"
  | "reconciliation_required";

export type RefundAuditEntry = {
  id: string;
  bookingReference: string;
  sumUpTransactionId?: string;
  originalAmountPaid: number;
  refundAmount: number;
  cumulativeRefundedAmount: number;
  remainingBalance: number;
  /** Original paid minus cumulative refunded after this operation. */
  amountRetained?: number;
  currency: string;
  fullOrPartial: "full" | "partial" | "none";
  cancelBooking: boolean;
  reasonCategory: RefundReasonCategory;
  /** Human label captured at request time for permanent audit readability. */
  reasonLabel?: string;
  ownerNotes: string;
  /** ISO timestamp when owner notes were recorded for this operation. */
  ownerNotesAt?: string;
  customerFacingReason?: string;
  /** Who initiated (owner portal / refund-test / legacy). */
  initiatedBy?: "owner" | "owner_refund_test" | "legacy";
  /** Whether pickup was within 24 hours at request time. */
  within24HoursOfPickup?: boolean;
  /** Combined booking status after the operation completed. */
  bookingStatusAfter?: PaidBookingMoneyStatus | string;
  requestedAt: string;
  completedAt?: string;
  processorAcceptedAt?: string;
  sumUpStatus?: string;
  sumUpReference?: string;
  success: boolean;
  failureDetail?: string;
  customerEmailStatus: "sent" | "failed" | "skipped" | "pending";
  ownerEmailStatus: "sent" | "failed" | "skipped" | "pending";
  idempotencyKey: string;
  actionKind: RefundActionKind;
  operationState: RefundOperationState;
};

export type RefundRequestInput = {
  paymentReference: string;
  trackingToken?: string;
  amount?: number | null;
  cancelBooking: boolean;
  refundFullRemaining: boolean;
  reasonCategory: RefundReasonCategory;
  ownerNotes?: string;
  customerFacingReason?: string;
  idempotencyKey: string;
  confirmOwnerKey: string;
  actionKind: RefundActionKind;
};

export function roundGbp(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function remainingRefundableBalance(
  amountPaid: number,
  amountRefunded: number,
): number {
  return roundGbp(Math.max(0, amountPaid - amountRefunded));
}

export function parseMoneyLabelToNumber(label: string | undefined | null): number | null {
  if (!label) return null;
  const match = label.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 0 ? roundGbp(n) : null;
}

export function hoursUntilPickup(
  tripDate: string,
  tripTime: string,
  now = new Date(),
): number | null {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime.trim() || "00:00");
  if (!pickup) return null;
  return (pickup.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export function isWithin24HoursOfPickup(
  tripDate: string,
  tripTime: string,
  now = new Date(),
): boolean {
  const hours = hoursUntilPickup(tripDate, tripTime, now);
  if (hours == null) return true;
  return hours < 24;
}

export function ownerNotesRequired(input: {
  reasonCategory: RefundReasonCategory;
  refundAmount: number;
  refundFullRemaining: boolean;
  within24h: boolean;
}): boolean {
  if (input.reasonCategory === "other") return true;
  if (input.reasonCategory === "goodwill" || input.reasonCategory === "partial_refund_agreed") {
    return true;
  }
  if (!input.refundFullRemaining && input.refundAmount > 0) return true;
  if (input.within24h && input.refundAmount > 0) return true;
  return false;
}

/**
 * Client-side gate for the production cancel/refund form.
 * Amount/reason/notes are editable without the owner key; submit still requires it.
 */
export function canSubmitOwnerRefundForm(input: {
  busy: boolean;
  /** Cancel-only allows £0; money moves require a valid positive amount. */
  moneyMoveRequired: boolean;
  refundAmount: number;
  remainingRefundable: number;
  reasonCategory: RefundReasonCategory | "";
  ownerNotes: string;
  confirmOwnerKey: string;
  finalConfirm: boolean;
  refundFullRemaining: boolean;
  within24h: boolean;
}): { ok: boolean; reason?: string } {
  if (input.busy) return { ok: false, reason: "busy" };
  if (!input.reasonCategory) return { ok: false, reason: "missing_reason" };
  if (
    !REFUND_REASON_CATEGORIES.includes(input.reasonCategory as RefundReasonCategory)
  ) {
    return { ok: false, reason: "invalid_reason" };
  }
  if (input.moneyMoveRequired) {
    if (!Number.isFinite(input.refundAmount) || input.refundAmount <= 0) {
      return { ok: false, reason: "invalid_amount" };
    }
    if (input.refundAmount > input.remainingRefundable + 0.001) {
      return { ok: false, reason: "amount_exceeds_remaining" };
    }
  }
  if (
    ownerNotesRequired({
      reasonCategory: input.reasonCategory as RefundReasonCategory,
      refundAmount: input.refundAmount,
      refundFullRemaining: input.refundFullRemaining,
      within24h: input.within24h,
    }) &&
    !input.ownerNotes.trim()
  ) {
    return { ok: false, reason: "notes_required" };
  }
  if (!input.confirmOwnerKey.trim()) return { ok: false, reason: "missing_owner_key" };
  if (!input.finalConfirm) return { ok: false, reason: "missing_confirm" };
  return { ok: true };
}

export function resolveRefundAmountForAction(input: {
  actionKind: RefundActionKind;
  remainingBalance: number;
  amount?: number | null;
  refundFullRemaining: boolean;
}): { refundAmount: number; error?: string } {
  const remaining = roundGbp(input.remainingBalance);
  if (input.actionKind === "cancel_no_refund") {
    return { refundAmount: 0 };
  }
  // External mark books the remaining balance as already refunded — no SumUp call.
  if (input.actionKind === "mark_external_refund") {
    return { refundAmount: remaining };
  }

  const wantsFull =
    input.refundFullRemaining ||
    input.actionKind === "cancel_full_refund" ||
    input.actionKind === "full_refund_and_cancel" ||
    input.actionKind === "full_refund_keep_active";

  if (wantsFull) {
    if (remaining <= 0) {
      return { refundAmount: 0, error: "Nothing left to refund on this booking." };
    }
    return { refundAmount: remaining };
  }

  const raw = Number(input.amount);
  if (!Number.isFinite(raw) || raw <= 0) {
    return { refundAmount: 0, error: "Partial refund amount must be greater than £0." };
  }
  const amount = roundGbp(raw);
  if (amount > remaining + 0.001) {
    return {
      refundAmount: 0,
      error: `Refund amount cannot exceed the remaining balance of £${remaining.toFixed(2)}.`,
    };
  }
  return { refundAmount: amount };
}

export function derivePaymentStatus(
  amountPaid: number,
  amountRefunded: number,
): PaymentRefundStatus {
  const remaining = remainingRefundableBalance(amountPaid, amountRefunded);
  if (amountRefunded > 0 && remaining <= 0.001) return "fully_refunded";
  if (amountRefunded > 0) return "partially_refunded";
  return "paid";
}

export function deriveCombinedStatus(
  operationalStatus: OperationalBookingStatus,
  paymentStatus: PaymentRefundStatus,
): PaidBookingMoneyStatus {
  if (operationalStatus === "cancelled") {
    return paymentStatus === "fully_refunded" ? "refunded" : "cancelled";
  }
  if (paymentStatus === "fully_refunded") return "refunded_active";
  if (paymentStatus === "partially_refunded") return "partially_refunded";
  return "confirmed";
}

/** Prefer explicit fields; fall back to legacy combined `status`. */
export function resolveOperationalStatus(input: {
  operationalStatus?: OperationalBookingStatus | string;
  status?: string;
}): OperationalBookingStatus {
  if (input.operationalStatus === "cancelled" || input.operationalStatus === "confirmed") {
    return input.operationalStatus;
  }
  // Legacy: "refunded" meant cancel+full refund. "refunded_active" keeps journey.
  if (input.status === "refunded" || input.status === "cancelled") return "cancelled";
  return "confirmed";
}

export function resolvePaymentStatusFromRecord(input: {
  paymentStatus?: PaymentRefundStatus | string;
  status?: string;
  amountPaid: number;
  amountRefunded: number;
}): PaymentRefundStatus {
  if (
    input.paymentStatus === "paid" ||
    input.paymentStatus === "partially_refunded" ||
    input.paymentStatus === "fully_refunded"
  ) {
    return input.paymentStatus;
  }
  if (input.status === "refunded" || input.status === "refunded_active") {
    return "fully_refunded";
  }
  if (input.status === "partially_refunded") return "partially_refunded";
  return derivePaymentStatus(input.amountPaid, input.amountRefunded);
}

export function nextBookingStatuses(input: {
  cancelBooking: boolean;
  previouslyCancelled?: boolean;
  amountPaid: number;
  amountRefundedAfter: number;
}): {
  operationalStatus: OperationalBookingStatus;
  paymentStatus: PaymentRefundStatus;
  status: PaidBookingMoneyStatus;
} {
  const operationalStatus: OperationalBookingStatus =
    input.cancelBooking || input.previouslyCancelled ? "cancelled" : "confirmed";
  const paymentStatus = derivePaymentStatus(input.amountPaid, input.amountRefundedAfter);
  return {
    operationalStatus,
    paymentStatus,
    status: deriveCombinedStatus(operationalStatus, paymentStatus),
  };
}

/** @deprecated Prefer nextBookingStatuses — kept for older call sites. */
export function nextMoneyStatus(input: {
  cancelBooking: boolean;
  amountPaid: number;
  amountRefundedAfter: number;
}): PaidBookingMoneyStatus {
  return nextBookingStatuses(input).status;
}

/**
 * Operational cancel only — never treat refunded_active (money fully returned,
 * journey still live) as cancelled.
 */
export function isOperationallyCancelled(
  statusOrRecord?:
    | string
    | {
        status?: string;
        operationalStatus?: string;
      },
): boolean {
  if (!statusOrRecord) return false;
  if (typeof statusOrRecord === "string") {
    return statusOrRecord === "refunded" || statusOrRecord === "cancelled";
  }
  return resolveOperationalStatus(statusOrRecord) === "cancelled";
}

export function isFullyRefunded(
  status: string | undefined,
  amountPaid: number,
  amountRefunded: number,
): boolean {
  if (status === "refunded" || status === "refunded_active") return true;
  return amountPaid > 0 && remainingRefundableBalance(amountPaid, amountRefunded) <= 0.001;
}

/** Journey still bookable / trackable (not operationally cancelled). */
export function isJourneyStillActive(statusOrRecord?: string | { status?: string; operationalStatus?: string }): boolean {
  return !isOperationallyCancelled(statusOrRecord);
}

/**
 * Owner can mark a paid booking as already refunded externally (manual SumUp)
 * when it is not already closed as fully refunded.
 */
export function canMarkExternalRefund(input: {
  status?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  amountPaid: number;
  amountRefunded: number;
}): boolean {
  if (!Number.isFinite(input.amountPaid) || input.amountPaid <= 0) return false;
  if (input.status === "refunded") return false;
  if (
    resolveOperationalStatus(input) === "cancelled" &&
    resolvePaymentStatusFromRecord({
      paymentStatus: input.paymentStatus,
      status: input.status,
      amountPaid: input.amountPaid,
      amountRefunded: input.amountRefunded,
    }) === "fully_refunded"
  ) {
    return false;
  }
  return true;
}

/** Default audit note when owner confirms a manual SumUp refund already done. */
export const EXTERNAL_REFUND_OWNER_NOTES =
  "Manually confirmed refunded by Owner — no SumUp API refund issued.";

export function generateRefundOpId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cap a requested refund so cumulative never exceeds paid (after SumUp reconcile). */
export function cappedRefundAmount(input: {
  requested: number;
  amountPaid: number;
  alreadyRefunded: number;
}): number {
  const remaining = remainingRefundableBalance(input.amountPaid, input.alreadyRefunded);
  return roundGbp(Math.max(0, Math.min(input.requested, remaining)));
}

/**
 * Apply SumUp's processor-authoritative refunded total to local books.
 *
 * Never trust the requested amount alone when the retrieve-transaction total differs
 * (SumUp refund POSTs often return 204/empty bodies).
 */
export function applyProcessorAuthoritativeRefund(input: {
  amountPaid: number;
  /** Local cumulative before this operation (or last known local). */
  localAmountRefunded: number;
  /** SumUp refunded_amount / event total after the operation. */
  processorAmountRefunded: number;
  /** Amount we asked SumUp to refund in this operation. */
  requestedThisOperation: number;
}): {
  amountRefunded: number;
  remainingRefundable: number;
  expectedCumulative: number;
  reconciliationRequired: boolean;
  furtherRefundBlocked: boolean;
  paymentStatus: PaymentRefundStatus;
} {
  const amountPaid = roundGbp(Math.max(0, input.amountPaid));
  const local = roundGbp(Math.max(0, input.localAmountRefunded));
  const processor = roundGbp(Math.max(0, input.processorAmountRefunded));
  const requested = roundGbp(Math.max(0, input.requestedThisOperation));
  const expectedCumulative = roundGbp(local + requested);
  // Processor wins — never understate what SumUp already moved.
  const amountRefunded = roundGbp(Math.max(local, processor));
  const remainingRefundable = remainingRefundableBalance(amountPaid, amountRefunded);
  const reconciliationRequired = Math.abs(processor - expectedCumulative) > 0.011;
  const furtherRefundBlocked = remainingRefundable < 0.01;
  return {
    amountRefunded,
    remainingRefundable,
    expectedCumulative,
    reconciliationRequired,
    furtherRefundBlocked,
    paymentStatus: derivePaymentStatus(amountPaid, amountRefunded),
  };
}

/** Cancellation policy version stored on bookings for audit (paired with TERMS_LAST_UPDATED). Not shown to customers at checkout. */
export const CANCELLATION_POLICY_VERSION = "August 2026 v3";
