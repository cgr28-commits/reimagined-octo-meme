/**
 * Short-notice booking requests awaiting Owner approval before SumUp.
 * Separate from confirmed paid bookings — never invents a second paid record on pay.
 */

import type { PaidBookingDetails } from "./booking-notifications";
import {
  normalizeShortNoticeConfirmationWindowHours,
  SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
} from "./booking-notice";
import { formatLondonClockTime } from "./uk-time";
import type { PaymentHoldReason } from "./vehicle-capacity";

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

export const SHORT_NOTICE_HISTORY_EVENT_TYPES = [
  "request_submitted",
  "owner_approved",
  "owner_declined",
  "alternative_time_offered",
  "alternative_accepted",
  "alternative_declined",
  "payment_link_created",
  "payment_completed",
  "booking_confirmed",
  "request_expired",
] as const;

export type ShortNoticeHistoryEventType = (typeof SHORT_NOTICE_HISTORY_EVENT_TYPES)[number];

export type ShortNoticeHistoryEvent = {
  type: ShortNoticeHistoryEventType;
  at: string;
};

export function appendShortNoticeHistory(
  existing: ShortNoticeHistoryEvent[] | undefined,
  type: ShortNoticeHistoryEventType,
  at: string,
): ShortNoticeHistoryEvent[] {
  return [...(existing ?? []), { type, at }];
}

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
  /** True when the configured minimum online notice forced this request. */
  underMinimumNotice?: boolean;
  /** Lead time in force when this under-notice request was created. */
  minimumShortNoticeLeadHoursApplied?: number;
  /**
   * Confirmation window (whole hours) in force when this request was created.
   * Customer wording and the expiry email use this, not the live dashboard setting.
   */
  shortNoticeConfirmationWindowHours?: number;
  /**
   * shortNoticeRequestedAt plus the confirmation window, in elapsed time.
   * Only set for under-notice requests.
   * Authoritative response deadline — later setting changes do not rewrite it.
   */
  shortNoticeRequestedAt?: string;
  shortNoticeExpiresAt?: string;
  /** Why SHORT_NOTICE_EXPIRED was set. Response-window expiry is not a decline. */
  expiryReason?: "response_window" | "payment_window";
  responseExpiredAt?: string;
  /** Set after the one customer expiry email is sent. */
  responseExpiryEmailSentAt?: string;
  /**
   * Why payment was held for Owner approval.
   * Includes luggage_capacity when the conservative 7 Seater high-load rule applies.
   */
  holdReasons?: PaymentHoldReason[];
  /** Append-only audit trail — never overwrites earlier events. */
  history?: ShortNoticeHistoryEvent[];
  /** Set when the customer decline/no-availability email was sent. */
  declineEmailSentAt?: string;
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
  /**
   * Server time immediately after the payment window still allowed a new
   * checkout, and before the SumUp create call. Fixed for that checkout.
   * Later Availability changes do not move it.
   */
  checkoutStartedAt?: string;
  /**
   * SumUp Checkout.date from the create response (ISO). GET /v0.1/checkouts
   * returns the same creation timestamp. Not the payment-completion time.
   */
  sumUpCheckoutCreatedAt?: string;
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
  /**
   * Owner soft-removed this booking from the active dashboard.
   * Record + payment/audit history are retained — never a hard delete.
   */
  removedFromDashboardAt?: string;
  removedFromDashboardBy?: "Owner";
  /** Cleared when Owner restores a soft-removed booking to the active list. */
  restoredToDashboardAt?: string;
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

export function shortNoticeArchivedIndexKey(): string {
  return "short-notice:archived";
}

/** Best-effort exclusive claim for concurrent owner approve vs decline. */
export function shortNoticeDecisionKey(reference: string): string {
  return `short-notice:decision:${reference.trim()}`;
}

/** Claim so two expiry passes cannot both email the customer. */
export function shortNoticeExpiryEmailKey(reference: string): string {
  return `short-notice:expiry-email:${reference.trim()}`;
}

/** One actual elapsed hour. Multiplied by the stored confirmation window. Not UK wall-clock arithmetic. */
export const SHORT_NOTICE_RESPONSE_WINDOW_MS = 60 * 60 * 1000;

export const SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE =
  "This short-notice request has expired and can no longer be accepted.";

export const SHORT_NOTICE_RESPONSE_EXPIRED_CUSTOMER_MESSAGE =
  "This booking request has expired. No payment has been taken and your journey has not been booked.";

export function shortNoticeResponseExpiresAtIso(
  requestedAt: string | Date,
  windowHours: number = SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
): string {
  const hours = normalizeShortNoticeConfirmationWindowHours(windowHours);
  const requested = requestedAt instanceof Date ? requestedAt : new Date(requestedAt);
  const start = Number.isNaN(requested.getTime()) ? Date.now() : requested.getTime();
  return new Date(start + hours * SHORT_NOTICE_RESPONSE_WINDOW_MS).toISOString();
}

/** Remaining time until the stored deadline. Uses shortNoticeExpiresAt, not the live setting. */
export function formatShortNoticeRemainingLabel(expiresAt: string, now = new Date()): string | null {
  const deadline = new Date(expiresAt).getTime();
  if (Number.isNaN(deadline)) return null;
  const remainingMs = deadline - now.getTime();
  if (remainingMs <= 0) return "0 minutes remaining";
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return minutes === 1 ? "1 minute remaining" : `${minutes} minutes remaining`;
  }
  if (minutes === 0) {
    return hours === 1 ? "1 hour remaining" : `${hours} hours remaining`;
  }
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  const minuteLabel = minutes === 1 ? "1 minute" : `${minutes} minutes`;
  return `${hourLabel} ${minuteLabel} remaining`;
}

export function formatShortNoticeDeadlineLine(expiresAt: string, now = new Date()): string {
  const remaining = formatShortNoticeRemainingLabel(expiresAt, now);
  const respondBy = formatLondonClockTime(expiresAt);
  if (!remaining) return respondBy ? `Respond by ${respondBy}` : "";
  return respondBy ? `${remaining} · Respond by ${respondBy}` : remaining;
}

export function isShortNoticeResponseExpiredRecord(
  record: Pick<ShortNoticeBookingRecord, "status" | "expiryReason">,
): boolean {
  return record.status === "SHORT_NOTICE_EXPIRED" && record.expiryReason === "response_window";
}

export function isShortNoticeResponseWindowDue(
  record: Pick<
    ShortNoticeBookingRecord,
    "status" | "underMinimumNotice" | "shortNoticeExpiresAt"
  >,
  now = new Date(),
): boolean {
  if (record.status !== "SHORT_NOTICE_AWAITING_APPROVAL") return false;
  if (!record.underMinimumNotice || !record.shortNoticeExpiresAt) return false;
  const deadline = new Date(record.shortNoticeExpiresAt).getTime();
  if (Number.isNaN(deadline)) return false;
  return now.getTime() >= deadline;
}

/** Still in an actionable workflow status (before paid / terminal decline). */
export function isShortNoticeOpenStatus(status: ShortNoticeStatus): boolean {
  return (
    status === "SHORT_NOTICE_AWAITING_APPROVAL" ||
    status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" ||
    status === "SHORT_NOTICE_APPROVED"
  );
}

/** Shown on the active Owner short-notice dashboard. */
export function isShortNoticeActiveOnDashboard(record: ShortNoticeBookingRecord): boolean {
  return isShortNoticeOpenStatus(record.status) && !record.removedFromDashboardAt;
}

/** Retained history: soft-removed, owner/customer declined, or expired. Not hard-deleted. */
export function isShortNoticeArchivedRecord(record: ShortNoticeBookingRecord): boolean {
  if (record.removedFromDashboardAt) return true;
  return (
    record.status === "SHORT_NOTICE_DECLINED" ||
    record.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" ||
    record.status === "SHORT_NOTICE_EXPIRED"
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

/**
 * SumUp's create call can return shortly after we pass the start gate.
 * Used only to recognise that already-created checkout. It does not extend
 * the deadline for starting a new one.
 */
export const SHORT_NOTICE_CHECKOUT_CREATE_LAG_MS = 2 * 60 * 1000;

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether a SumUp checkout that our server already created for this booking
 * may still be confirmed. paymentExpiresAt blocks a new checkout. A checkout
 * admitted before that deadline may complete afterwards.
 *
 * SumUp Checkout.date is the provider creation time, not the time the
 * customer finished paying. A date a few seconds after the deadline is
 * accepted only when our own checkoutStartedAt (or a legacy pending
 * createdAt) shows we opened that same checkout before the deadline.
 */
export function shortNoticeVerifiedCheckoutDecision(input: {
  paymentExpiresAt?: string | null;
  now: Date;
  storedCheckoutId?: string | null;
  presentedCheckoutId: string;
  checkoutStartedAt?: string | null;
  legacyCheckoutRecordedAt?: string | null;
  sumUpCheckoutCreatedAt?: string | null;
}):
  | { ok: true }
  | {
      ok: false;
      reason: "missing_checkout" | "checkout_mismatch" | "after_deadline" | "sumup_date_not_in_window";
    } {
  const presented = input.presentedCheckoutId.trim();
  const stored = input.storedCheckoutId?.trim() ?? "";
  if (!presented || !stored) return { ok: false, reason: "missing_checkout" };
  if (presented !== stored) return { ok: false, reason: "checkout_mismatch" };

  const expiresMs = parseIsoMs(input.paymentExpiresAt);
  if (expiresMs == null) return { ok: false, reason: "after_deadline" };

  const startedMs = parseIsoMs(input.checkoutStartedAt);
  const legacyMs = startedMs == null ? parseIsoMs(input.legacyCheckoutRecordedAt) : null;
  const anchorMs = startedMs ?? legacyMs;
  const anchorLag = startedMs == null && legacyMs != null ? SHORT_NOTICE_CHECKOUT_CREATE_LAG_MS : 0;
  const withinDeadline = input.now.getTime() <= expiresMs;

  if (!withinDeadline) {
    if (anchorMs == null || anchorMs > expiresMs + anchorLag) {
      return { ok: false, reason: "after_deadline" };
    }
  }

  const sumUpMs = parseIsoMs(input.sumUpCheckoutCreatedAt);
  if (sumUpMs != null) {
    const earliest = (anchorMs ?? expiresMs) - SHORT_NOTICE_CHECKOUT_CREATE_LAG_MS;
    const latest = Math.max(expiresMs, anchorMs ?? expiresMs) + SHORT_NOTICE_CHECKOUT_CREATE_LAG_MS;
    if (sumUpMs < earliest || sumUpMs > latest) {
      return { ok: false, reason: "sumup_date_not_in_window" };
    }
  }

  return { ok: true };
}
