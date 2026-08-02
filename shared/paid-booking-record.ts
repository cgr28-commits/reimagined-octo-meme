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
