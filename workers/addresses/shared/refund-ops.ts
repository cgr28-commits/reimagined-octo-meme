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
  "other",
] as const;

export type RefundReasonCategory = (typeof REFUND_REASON_CATEGORIES)[number];

export const REFUND_REASON_LABELS: Record<RefundReasonCategory, string> = {
  customer_cancelled_over_24h: "Customer cancelled >24 hours",
  customer_cancelled_under_24h: "Customer cancelled <24 hours",
  business_cancelled: "Business cancelled",
  goodwill: "Goodwill",
  service_issue: "Service issue",
  fare_adjustment: "Fare adjustment",
  duplicate_incorrect_payment: "Duplicate/incorrect payment",
  other: "Other",
};

export type RefundActionKind =
  | "cancel_full_refund"
  | "cancel_partial_refund"
  | "cancel_no_refund"
  | "partial_refund_keep_active"
  | "full_refund_keep_active"
  | "full_refund_and_cancel";

export type PaidBookingMoneyStatus =
  | "confirmed"
  | "partially_refunded"
  | "refunded"
  | "cancelled";

export type RefundAuditEntry = {
  id: string;
  bookingReference: string;
  sumUpTransactionId?: string;
  originalAmountPaid: number;
  refundAmount: number;
  cumulativeRefundedAmount: number;
  remainingBalance: number;
  currency: string;
  fullOrPartial: "full" | "partial" | "none";
  cancelBooking: boolean;
  reasonCategory: RefundReasonCategory;
  ownerNotes: string;
  customerFacingReason?: string;
  requestedAt: string;
  completedAt?: string;
  sumUpStatus?: string;
  sumUpReference?: string;
  success: boolean;
  failureDetail?: string;
  customerEmailStatus: "sent" | "failed" | "skipped" | "pending";
  ownerEmailStatus: "sent" | "failed" | "skipped" | "pending";
  idempotencyKey: string;
  actionKind: RefundActionKind;
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
  if (input.reasonCategory === "other" || input.reasonCategory === "goodwill") return true;
  if (!input.refundFullRemaining && input.refundAmount > 0) return true;
  if (input.within24h && input.refundAmount > 0) return true;
  return false;
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

export function nextMoneyStatus(input: {
  cancelBooking: boolean;
  amountPaid: number;
  amountRefundedAfter: number;
}): PaidBookingMoneyStatus {
  const remaining = remainingRefundableBalance(input.amountPaid, input.amountRefundedAfter);
  if (input.amountRefundedAfter > 0 && remaining <= 0.001) {
    return "refunded";
  }
  if (input.amountRefundedAfter > 0) {
    return "partially_refunded";
  }
  if (input.cancelBooking) return "cancelled";
  return "confirmed";
}

export function isOperationallyCancelled(status: string | undefined): boolean {
  return status === "refunded" || status === "cancelled";
}

export function isFullyRefunded(
  status: string | undefined,
  amountPaid: number,
  amountRefunded: number,
): boolean {
  if (status === "refunded") return true;
  return amountPaid > 0 && remainingRefundableBalance(amountPaid, amountRefunded) <= 0.001;
}

export function generateRefundOpId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cancellation policy version shown at checkout (paired with TERMS_LAST_UPDATED). */
export const CANCELLATION_POLICY_VERSION = "August 2026 v2";
