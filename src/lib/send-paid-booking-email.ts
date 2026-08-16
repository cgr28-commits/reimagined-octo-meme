import type { BookingDetails } from "@/lib/booking-message";
import type { PaymentConfirmationResult } from "@/lib/create-payment";
import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  type PaidBookingReceipt,
} from "../../shared/booking-notifications";

function resolveBookingsApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!url) {
    return "";
  }

  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return "";
    }
  } catch {
    return "";
  }

  return url;
}

export function isBrowserBookingEmailAvailable(): boolean {
  // Browser no longer sends mail directly — paid confirmations go through the worker.
  return Boolean(resolveBookingsApiUrl());
}

function toReceipt(booking: BookingDetails, payment: PaymentConfirmationResult): PaidBookingReceipt {
  return {
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    mobileNumber: booking.mobileNumber,
    tripLabel: booking.tripLabel,
    pickupLabel: booking.pickupLabel,
    dropoffLabel: booking.dropoffLabel,
    returnJourney: booking.returnJourney,
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
    returnDate: booking.returnDate ?? "",
    returnTime: booking.returnTime ?? "",
    flightNumber: booking.flightNumber,
    returnFlightNumber: booking.returnFlightNumber,
    passengers: booking.passengers,
    suitcases: booking.suitcases,
    vehicle: booking.vehicle,
    journeyDistance: booking.journeyDistance,
    journeyDuration: booking.journeyDuration,
    isAirportTrip: booking.isAirportTrip,
    amountPaid: payment.amountPaid,
    paymentReference: payment.paymentReference,
  };
}

/**
 * Best-effort paid-booking email fallback.
 * FormSubmit removed — relies on the Cloudflare Worker confirm-payment path.
 * This helper only rebuilds local templates for diagnostics; it does not post
 * booking data to third-party browser form endpoints.
 */
export async function sendPaidBookingEmailsFromBrowser(
  booking: BookingDetails,
  payment: PaymentConfirmationResult,
): Promise<{ customerEmailSent: boolean; ownerEmailSent: boolean }> {
  // Worker confirm-payment already sends Resend emails. Browser FormSubmit/Web3Forms
  // fallbacks are intentionally removed for deliverability and security.
  void toReceipt(booking, payment);
  void buildCustomerConfirmationEmail;
  void buildOwnerPaidBookingEmail;
  console.error(
    "Browser paid-booking email fallback is disabled — configure RESEND_API_KEY on the worker",
  );
  return { customerEmailSent: false, ownerEmailSent: false };
}
