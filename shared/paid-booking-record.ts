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
  /** ISO expiry — unpaid proposals must not be payable after this. */
  expiresAt: string;
  createdBy: "Owner" | "Customer";
  proposed: Record<string, string | number | boolean | null | undefined>;
  previousFare: number;
  newFare: number;
  additionalPaymentAmount: number;
  checkoutId?: string;
  checkoutReference?: string;
  paymentUrl?: string;
  idempotencyKey: string;
  status: "awaiting_payment" | "abandoned" | "committed" | "expired";
};

/** Separate SumUp top-up payment for an amendment (never overwrites original paymentReference). */
export type PaidBookingAdditionalPayment = {
  amount: number;
  checkoutId: string;
  /** SumUp transaction / checkout reference for this top-up only. */
  paymentReference: string;
  amendmentId: string;
  paidAt: string;
  transactionId?: string;
  transactionCode?: string;
};

export type PaidBookingRecord = {
  /**
   * Internal / SumUp reconciliation key (transaction code or checkout ref).
   * Not the customer-facing booking reference — see {@link customerReference}.
   */
  paymentReference: string;
  /**
   * Short customer-facing booking reference (MAT-4827).
   * Unique per booking; used on invoices, emails, and Manage Booking lookup.
   */
  customerReference?: string;
  /**
   * Opaque Manage Booking access token (unguessable). Used in email deep-links
   * as /manage-booking?token=… — never derived from MAT-#### or email.
   */
  manageBookingToken?: string;
  checkoutId: string;
  transactionId?: string;
  transactionCode?: string;
  /**
   * Current agreed / journey fare (may differ from money collected while a
   * refund-due or unpaid top-up is outstanding).
   */
  amount: number;
  currency: string;
  /**
   * Display of gross money collected from the customer (original + top-ups).
   * Must not be rewritten to a lower journey fare while refundDueAmount > 0.
   * After refunds, still typically shows gross collected; use amountRefunded
   * for money returned.
   */
  amountPaidLabel: string;
  /**
   * Original checkout amount at first payment (preserved when amendments add
   * top-ups or lower the journey fare). Defaults to first known collected amount.
   */
  originalAmount?: number;
  /** Append-only SumUp top-up payments for higher-fare amendments. */
  additionalPayments?: PaidBookingAdditionalPayment[];
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
  /**
   * Owner-seeded Manage Booking amendment fixture (no SumUp charge).
   * Fully-paid for same-fare amendment tests only — never a live card payment.
   * Must never appear as a real customer journey / Upcoming Job.
   */
  isAmendmentTestFixture?: boolean;
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

/** Secondary index: short customer ref MAT-#### → paymentReference. */
export function paidBookingCustomerRefKey(customerReference: string): string {
  return `booking:customer-ref:${customerReference.trim().toUpperCase()}`;
}

/** Secondary index: opaque manage-booking token → paymentReference. */
export function paidBookingManageTokenKey(token: string): string {
  return `booking:manage-token:${token.trim().toLowerCase()}`;
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

/** Index of owner-seeded same-fare amendment test fixtures (no SumUp). */
export function paidBookingAmendmentTestIndexKey(): string {
  return "booking:amendment-test:index";
}

/** KV key for a pending material amendment awaiting extra payment. */
export function pendingBookingAmendmentKey(amendmentId: string): string {
  return `pending-amendment:${amendmentId.trim()}`;
}

function roundMoneyGbp(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function parsePaidLabel(label: string | undefined | null): number | null {
  if (!label) return null;
  const match = label.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 0 ? roundMoneyGbp(n) : null;
}

/** Current journey / agreed fare on the booking. */
export function journeyFareOf(
  record: Pick<PaidBookingRecord, "amount">,
): number {
  return typeof record.amount === "number" && Number.isFinite(record.amount)
    ? roundMoneyGbp(record.amount)
    : 0;
}

/**
 * Gross money actually collected (original checkout + amendment top-ups).
 * Does not subtract refunds — use {@link netAmountRetainedOf} for that.
 */
export function grossAmountCollectedOf(
  record: Pick<
    PaidBookingRecord,
    "originalAmount" | "amount" | "amountPaidLabel" | "additionalPayments"
  >,
): number {
  const additional = (record.additionalPayments ?? []).reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0,
  );
  if (
    typeof record.originalAmount === "number" &&
    Number.isFinite(record.originalAmount) &&
    record.originalAmount >= 0
  ) {
    return roundMoneyGbp(record.originalAmount + additional);
  }
  const fromLabel = parsePaidLabel(record.amountPaidLabel);
  if (fromLabel != null && fromLabel > 0) {
    return fromLabel;
  }
  if (typeof record.amount === "number" && record.amount > 0) {
    return roundMoneyGbp(record.amount);
  }
  return 0;
}

export function amountActuallyRefundedOf(
  record: Pick<PaidBookingRecord, "amountRefunded" | "status" | "amount" | "amountPaidLabel" | "originalAmount" | "additionalPayments">,
): number {
  if (typeof record.amountRefunded === "number" && record.amountRefunded >= 0) {
    return roundMoneyGbp(record.amountRefunded);
  }
  if (record.status === "refunded" || record.status === "refunded_active") {
    return grossAmountCollectedOf(record);
  }
  return 0;
}

/** Gross collected minus amount actually refunded via SumUp. */
export function netAmountRetainedOf(
  record: Pick<
    PaidBookingRecord,
    | "originalAmount"
    | "amount"
    | "amountPaidLabel"
    | "additionalPayments"
    | "amountRefunded"
    | "status"
  >,
): number {
  return roundMoneyGbp(
    Math.max(0, grossAmountCollectedOf(record) - amountActuallyRefundedOf(record)),
  );
}

/**
 * How much more should be refunded so net retained matches the journey fare.
 * Zero when the customer still owes a top-up or accounts already match.
 */
export function refundDueToAlignWithJourneyFare(
  record: Pick<
    PaidBookingRecord,
    | "originalAmount"
    | "amount"
    | "amountPaidLabel"
    | "additionalPayments"
    | "amountRefunded"
    | "status"
  >,
  journeyFare: number = journeyFareOf(record),
): number {
  return roundMoneyGbp(Math.max(0, netAmountRetainedOf(record) - journeyFare));
}

/** Fare note for updated confirmation before a refund has been issued. */
export function buildLowerFareAmendmentFareNote(input: {
  newFare: number;
  refundDue: number;
}): string {
  return (
    `Updated journey price: £${input.newFare.toFixed(2)}\n` +
    `Refund due: £${input.refundDue.toFixed(2)}`
  );
}
