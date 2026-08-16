export type PaidBookingStatus = "confirmed" | "refunded";

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
};

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
