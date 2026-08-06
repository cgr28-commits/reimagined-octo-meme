import type { BookingDetails } from "@/lib/booking-message";
import type { PaymentConfirmationResult } from "@/lib/create-payment";
import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  type PaidBookingReceipt,
} from "../../shared/booking-notifications";
import { sendViaFormSubmitEmail } from "../../shared/email-delivery";
import { SITE } from "@/lib/data";

const WEB3FORMS_ACCESS_KEY =
  process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY?.trim() ?? "";

export function isBrowserBookingEmailAvailable(): boolean {
  return Boolean(WEB3FORMS_ACCESS_KEY);
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

async function submitWeb3Forms(payload: Record<string, unknown>): Promise<boolean> {
  if (!WEB3FORMS_ACCESS_KEY) {
    return false;
  }

  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      access_key: WEB3FORMS_ACCESS_KEY,
      ...payload,
    }),
  });

  const body = (await response.json().catch(() => null)) as { success?: unknown } | null;
  return response.ok && body?.success === true;
}

/** Sends customer invoice + owner notification from the browser when the worker cannot. */
export async function sendPaidBookingEmailsFromBrowser(
  booking: BookingDetails,
  payment: PaymentConfirmationResult,
): Promise<{ customerEmailSent: boolean; ownerEmailSent: boolean }> {
  const receipt = toReceipt(booking, payment);
  const customerEmail = buildCustomerConfirmationEmail(receipt, "My Airport Taxi NI", {
    trackUrl: payment.trackUrl,
  });
  const ownerEmail = buildOwnerPaidBookingEmail(receipt, "My Airport Taxi NI", {
    trackUrl: payment.trackUrl,
  });

  let customerEmailSent = await sendViaFormSubmitEmail({
    to: booking.customerEmail,
    subject: customerEmail.subject,
    htmlBody: customerEmail.html,
    textBody: customerEmail.text,
    fromName: "My Airport Taxi NI",
  });

  if (!customerEmailSent) {
    customerEmailSent = await submitWeb3Forms({
      subject: customerEmail.subject,
      name: booking.customerName,
      email: booking.customerEmail,
      from_name: "My Airport Taxi NI",
      replyto: SITE.email,
      message: customerEmail.text,
      autoresponse: {
        subject: customerEmail.subject,
        message: customerEmail.text,
      },
    });
  }

  let ownerEmailSent = await sendViaFormSubmitEmail({
    to: SITE.email,
    subject: ownerEmail.subject,
    textBody: ownerEmail.body,
    fromName: "My Airport Taxi NI",
  });

  if (!ownerEmailSent) {
    ownerEmailSent = await submitWeb3Forms({
      subject: ownerEmail.subject,
      name: booking.customerName,
      from_name: "My Airport Taxi NI",
      replyto: SITE.email,
      message: ownerEmail.body,
    });
  }

  return { customerEmailSent, ownerEmailSent };
}
