/**
 * Short-notice booking requests awaiting Owner approval before SumUp.
 * Separate from confirmed paid bookings — never invents a second paid record on pay.
 */

import type { PaidBookingDetails } from "./booking-notifications";

export const SHORT_NOTICE_STATUSES = [
  "SHORT_NOTICE_AWAITING_APPROVAL",
  "SHORT_NOTICE_ALTERNATIVE_OFFERED",
  "SHORT_NOTICE_APPROVED",
  "SHORT_NOTICE_DECLINED",
  "SHORT_NOTICE_ALTERNATIVE_DECLINED",
  "SHORT_NOTICE_PAID",
  "SHORT_NOTICE_EXPIRED",
] as const;

export type ShortNoticeStatus = (typeof SHORT_NOTICE_STATUSES)[number];

/** Customer response to an Owner alternative-time offer. */
export type ShortNoticeCustomerResponse = "accepted" | "declined";

/** Sanitize optional customer free-text before store/display (never blocks accept/decline). */
export function sanitizeCustomerResponseNote(raw: unknown, maxLen = 500): string {
  if (typeof raw !== "string") return "";
  const stripped = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}

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
  /** Legacy single availability-from audit. */
  automaticBookingsAvailableFromApplied?: string | null;
  /** Unavailable period that triggered Owner approval (if any). */
  unavailablePeriodIdApplied?: string | null;
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
  /**
   * When the automatic/manual “ready for payment” email was last sent for the
   * current secure pay URL. Idempotent auto-send skips when this matches the
   * current pay URL fingerprint.
   */
  paymentLinkEmailSentAt?: string;
  /** Pay URL that was emailed (detect new-link eligibility). */
  paymentLinkEmailPayUrl?: string;
  /**
   * Snapshot of the customer’s originally requested pickup.
   * Set when Owner first offers an alternative; immutable after that.
   */
  originalRequestedDate?: string;
  originalRequestedTime?: string;
  /** Owner-proposed alternative pickup (YYYY-MM-DD / HH:mm). */
  offeredDate?: string;
  offeredTime?: string;
  offeredAt?: string;
  offeredBy?: "Owner";
  /** Optional private/customer note included in the alternative-time email. */
  offeredNote?: string;
  /** Opaque token for /accept-alternative-time/?token=… (not the payment token). */
  acceptToken?: string;
  /** When the alternative-time offer email was last sent for the current accept URL. */
  alternativeTimeEmailSentAt?: string;
  /** Accept URL fingerprint for idempotent auto-send of the offer email. */
  alternativeTimeEmailAcceptUrl?: string;
  /** When the customer accepted the offered pickup time. */
  acceptedAlternativeAt?: string;
  /** Customer accept/decline of the alternative-time offer. */
  customerResponse?: ShortNoticeCustomerResponse;
  /** Optional note from the customer on the response page (sanitized). */
  customerResponseNote?: string;
  /** When the customer submitted accept or decline on the response page. */
  customerResponseAt?: string;
  /** When the customer declined the offered alternative time. */
  declinedAlternativeAt?: string;
  /** Optional personal quote — marked used only after successful SumUp finalize. */
  personalQuoteCode?: string;
  standardWebsiteAmount?: number;
};

export function shortNoticeRefKey(reference: string): string {
  return `short-notice:ref:${reference.trim()}`;
}

export function shortNoticeTokenKey(token: string): string {
  return `short-notice:token:${token.trim()}`;
}

export function shortNoticeAcceptTokenKey(token: string): string {
  return `short-notice:accept:${token.trim()}`;
}

export function shortNoticeOpenIndexKey(): string {
  return "short-notice:open";
}

export function isShortNoticeOpenStatus(status: ShortNoticeStatus): boolean {
  return (
    status === "SHORT_NOTICE_AWAITING_APPROVAL" ||
    status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" ||
    status === "SHORT_NOTICE_APPROVED"
  );
}

export function isShortNoticePayable(record: ShortNoticeBookingRecord, now = new Date()): boolean {
  if (record.status !== "SHORT_NOTICE_APPROVED") return false;
  if (record.paymentReference || record.paidAt) return false;
  if (!record.paymentExpiresAt) return false;
  const expires = new Date(record.paymentExpiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) return false;
  return true;
}
