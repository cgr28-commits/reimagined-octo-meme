import type { RefundAuditEntry, PaidBookingMoneyStatus } from "./refund-ops";
import type { DateTimeAmendmentAuditEntry } from "./booking-amendment";

export type PaidBookingStatus = PaidBookingMoneyStatus;

/** Owner/customer audit entry when a paid booking is edited (never silently overwrite history). */
export type PaidBookingEditAuditEntry = {
  changedAt: string;
  field: string;
  previousValue: string;
  newValue: string;
  changedBy: "Owner" | "Customer" | "System";
};

/**
 * Full amendment event (material or schedule) — append-only audit trail.
 * Distinct from per-field editHistory; one entry per confirmed amendment.
 */
export type PaidBookingAmendmentEvent = {
  amendmentId: string;
  changedAt: string;
  changedBy: "Owner" | "Customer" | "System";
  before: Record<string, string | number | boolean | null | undefined>;
  after: Record<string, string | number | boolean | null | undefined>;
  previousFare?: number;
  newFare?: number;
  difference?: number;
  additionalPaymentAmount?: number;
  additionalPaymentReference?: string;
  refundAmount?: number;
  refundReference?: string;
  /** Owner kept a different agreed fare than the authoritative calculation. */
  ownerOverride?: {
    authoritativeFare: number;
    agreedFare: number;
    difference: number;
  };
  reasonNote?: string;
  confirmationEmailSentAt?: string;
  confirmationEmailError?: string;
  /** Idempotency key for payment/refund/email (stable per amendment). */
  idempotencyKey?: string;
};

/** Pending material amendment awaiting extra SumUp payment (higher fare). */
export type PendingBookingAmendment = {
  amendmentId: string;
  createdAt: string;
  createdBy: "Owner" | "Customer";
  proposed: Record<string, string | number | boolean | null | undefined>;
  previousFare: number;
  newFare: number;
  additionalPaymentAmount: number;
  checkoutId?: string;
  idempotencyKey: string;
  status: "awaiting_payment" | "abandoned" | "committed";
};

export type PaidBookingRecord = {
  paymentReference: string;
  checkoutId: string;
  transactionId?: string;
  transactionCode?: string;
  amount: number;
  currency: string;
  amountPaidLabel: string;
  /** Cumulative GBP already refunded via SumUp (authoritative money state). */
  amountRefunded?: number;
  /**
   * Refund due after a lower-fare amendment when automatic partial refund
   * was not completed — owner must process via refund UI.
   */
  refundDueAmount?: number;
  refundDueReason?: string;
  refundDueAt?: string;
  customerName: string;
  customerEmail: string;
  mobileNumber: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate?: string;
  returnTime?: string;
  /** Snapshot of the original booked schedule (set on first date/time amendment). */
  originalTripDate?: string;
  originalTripTime?: string;
  /** Count of customer self-service material amendments (quota). */
  dateTimeAmendmentCount?: number;
  /** Append-only date/time amendment history (customer + operator). */
  dateTimeAmendmentHistory?: DateTimeAmendmentAuditEntry[];
  /** Append-only full amendment events (material + schedule). */
  amendmentHistory?: PaidBookingAmendmentEvent[];
  /** In-flight higher-fare amendment awaiting extra payment. */
  pendingAmendment?: PendingBookingAmendment | null;
  /** Last automatic/manual updated confirmation attempt. */
  lastUpdatedConfirmationSentAt?: string;
  lastUpdatedConfirmationError?: string;
  lastUpdatedConfirmationAmendmentId?: string;
  /** Full trip details kept for resend / owner lookup. */
  flightNumber?: string;
  returnFlightNumber?: string;
  passengers?: number;
  suitcases?: number;
  childSeats?: number;
  childSeatNotes?: string;
  notes?: string;
  vehicle?: string;
  journeyDistance?: string;
  journeyDuration?: string;
  isAirportTrip?: boolean;
  airportCode?: string;
  isFromAirport?: boolean;
  termsAcceptedAt?: string;
  termsVersion?: string;
  /** Cancellation / checkout policy version shown beside Terms acceptance. */
  cancellationPolicyVersion?: string;
  trackingToken?: string;
  calendarEventIds: string[];
  /**
   * Combined compatibility status.
   * Prefer operationalStatus + paymentStatus when present.
   */
  status: PaidBookingStatus;
  /** Journey/calendar/tracking state — independent of refund money. */
  operationalStatus?: "confirmed" | "cancelled";
  /** SumUp money state — independent of journey cancel. */
  paymentStatus?: "paid" | "partially_refunded" | "fully_refunded";
  createdAt: string;
  refundedAt?: string;
  cancelledAt?: string;
  refundAmountLabel?: string;
  /** Append-only refund / cancellation audit trail (no secrets). */
  refundHistory?: RefundAuditEntry[];
  /** Owner/customer edit history (append-only). */
  editHistory?: PaidBookingEditAuditEntry[];
  /** Personal quote code when this booking used an individually agreed fare. */
  personalQuoteCode?: string;
  /** Website fare before personal quote (audit). */
  standardWebsiteAmount?: number;
  /** Authorised personal-quote fare (audit). */
  personalQuotedAmount?: number;
  /**
   * Owner-only live £1 SumUp refund smoke-test record.
   * Must never appear as a real customer journey / Upcoming Job.
   */
  isRefundTest?: boolean;
};

/** Default driver label when no other driver is assigned (multi-driver capable later). */
export const PRIMARY_DRIVER_LABEL = "Owner / Primary Driver";

export function resolveAssignedDriverLabel(assignedDriverName?: string | null): string {
  const trimmed = assignedDriverName?.trim();
  return trimmed || PRIMARY_DRIVER_LABEL;
}

export function paidBookingRefKey(paymentReference: string): string {
  return `booking:ref:${paymentReference.trim()}`;
}

/** Secondary index so confirm/webhook can find a paid booking by SumUp checkout id. */
export function paidBookingCheckoutKey(checkoutId: string): string {
  return `booking:checkout:${checkoutId.trim()}`;
}

/** London calendar day index for owner listing of recent SumUp pays. */
export function paidBookingCreatedDayIndexKey(day: string): string {
  return `booking:created:${day.trim()}`;
}

/** London calendar day index by journey/pickup date (Upcoming Jobs). */
export function paidBookingTripDayIndexKey(day: string): string {
  return `booking:trip:${day.trim()}`;
}

/** Append-only index of owner £1 live refund-test payment references. */
export function paidBookingRefundTestIndexKey(): string {
  return "booking:refund-test:index";
}

/** KV key for a pending material amendment awaiting extra payment. */
export function pendingBookingAmendmentKey(amendmentId: string): string {
  return `pending-amendment:${amendmentId.trim()}`;
}
