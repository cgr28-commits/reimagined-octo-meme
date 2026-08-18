export type PaidBookingStatus = "confirmed" | "refunded";

/** Owner-only audit entry when a paid booking is edited (never silently overwrite history). */
export type PaidBookingEditAuditEntry = {
  changedAt: string;
  field: string;
  previousValue: string;
  newValue: string;
  changedBy: "Owner";
};

export type PaidBookingRecord = {
  paymentReference: string;
  checkoutId: string;
  transactionId?: string;
  transactionCode?: string;
  amount: number;
  currency: string;
  amountPaidLabel: string;
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
  trackingToken?: string;
  calendarEventIds: string[];
  status: PaidBookingStatus;
  createdAt: string;
  refundedAt?: string;
  refundAmountLabel?: string;
  /** Owner-only edit history (append-only). */
  editHistory?: PaidBookingEditAuditEntry[];
  /** Personal quote code when this booking used an individually agreed fare. */
  personalQuoteCode?: string;
  /** Website fare before personal quote (audit). */
  standardWebsiteAmount?: number;
  /** Authorised personal-quote fare (audit). */
  personalQuotedAmount?: number;
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
