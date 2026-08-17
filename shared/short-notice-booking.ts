/**
 * Short-notice booking requests awaiting Owner approval before SumUp.
 * Separate from confirmed paid bookings — never invents a second paid record on pay.
 */

import type { PaidBookingDetails } from "./booking-notifications";

export const SHORT_NOTICE_STATUSES = [
  "SHORT_NOTICE_AWAITING_APPROVAL",
  "SHORT_NOTICE_APPROVED",
  "SHORT_NOTICE_DECLINED",
  "SHORT_NOTICE_PAID",
  "SHORT_NOTICE_EXPIRED",
] as const;

export type ShortNoticeStatus = (typeof SHORT_NOTICE_STATUSES)[number];

export type ShortNoticeBookingRecord = {
  /** Public customer reference e.g. MATNI-SN-… */
  reference: string;
  /** Non-guessable payment/approval token (URL secret). */
  paymentToken: string;
  status: ShortNoticeStatus;
  amount: number;
  currency: string;
  amountLabel: string;
  booking: PaidBookingDetails;
  /** Fare-affecting fingerprint locked at create / re-locked on approve. */
  materialFingerprint: string;
  /** Legacy hours audit (older KV records). */
  minimumNoticeHoursApplied?: number;
  /** Availability datetime applied when this request was created (London local). */
  automaticBookingsAvailableFromApplied?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: "Owner";
  /** Locked amount at approval (must match SumUp). */
  approvedAmount?: number;
  approvedFingerprint?: string;
  paymentExpiresAt?: string;
  declinedAt?: string;
  declineReason?: string;
  /** Set when SumUp checkout is created after approval. */
  checkoutId?: string;
  checkoutReference?: string;
  paymentUrl?: string;
  /** Set when paid — same paymentReference as the saved PaidBookingRecord. */
  paymentReference?: string;
  paidAt?: string;
};

export function shortNoticeRefKey(reference: string): string {
  return `short-notice:ref:${reference.trim()}`;
}

export function shortNoticeTokenKey(token: string): string {
  return `short-notice:token:${token.trim()}`;
}

export function shortNoticeOpenIndexKey(): string {
  return "short-notice:open";
}

export function isShortNoticePayable(record: ShortNoticeBookingRecord, now = new Date()): boolean {
  if (record.status !== "SHORT_NOTICE_APPROVED") return false;
  if (record.paymentReference || record.paidAt) return false;
  if (!record.paymentExpiresAt) return false;
  const expires = new Date(record.paymentExpiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) return false;
  return true;
}
