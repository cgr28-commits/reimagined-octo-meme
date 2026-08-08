import { AIRPORTS, isVehicleEnquiryOnly } from "@/lib/data";
import {
  isValidEmailAddress,
  isValidMobileNumber,
  type BookingDetails,
} from "@/lib/booking-message";
import { detectMobileDevice } from "@/lib/device";
import { buildMarketingOptInFields } from "@/lib/marketing-api";
import type { QuoteDraft } from "@/lib/quote-assistant";
import {
  openWhatsAppBookingMessage,
  submitBookingByEmail,
  submitEnquiryByEmail,
  submitMobileWhatsAppBooking,
  submitMobileWhatsAppEnquiry,
} from "@/lib/submit-booking";
import { buildBookingMessage, buildEnquiryBookingMessage } from "@/lib/booking-message";
import { TERMS_LAST_UPDATED } from "@/lib/terms";

export function buildBookingDetailsFromDraft(draft: QuoteDraft): BookingDetails | null {
  if (
    !draft.airportCode ||
    !draft.address ||
    !draft.direction ||
    draft.returnJourney === undefined ||
    draft.passengers === undefined ||
    draft.suitcases === undefined ||
    !draft.tripDate ||
    !draft.tripTime ||
    !draft.customerName?.trim() ||
    !draft.mobileNumber?.trim() ||
    !draft.customerEmail?.trim() ||
    !draft.flightNumber?.trim() ||
    !draft.termsAccepted
  ) {
    return null;
  }

  if (draft.returnJourney && (!draft.returnDate || !draft.returnTime || !draft.returnFlightNumber?.trim())) {
    return null;
  }

  const airportName =
    AIRPORTS.find((airport) => airport.code === draft.airportCode)?.name ?? draft.airportCode;
  const isFromAirport = draft.direction === "from-airport";
  const vehicle = draft.vehicle ?? "Estate Car (1–4 passengers)";
  const enquiryOnly = isVehicleEnquiryOnly(vehicle);

  return {
    customerName: draft.customerName.trim(),
    customerEmail: draft.customerEmail.trim(),
    mobileNumber: draft.mobileNumber.trim(),
    tripLabel: isFromAirport ? "Airport pickup" : "Airport drop-off",
    pickupLabel: isFromAirport ? airportName : draft.address,
    dropoffLabel: isFromAirport ? draft.address : airportName,
    returnJourney: draft.returnJourney,
    tripDate: draft.tripDate,
    tripTime: draft.tripTime,
    returnDate: draft.returnDate ?? "",
    returnTime: draft.returnTime ?? "",
    flightNumber: (draft.flightNumber ?? "").trim().toUpperCase(),
    returnFlightNumber: draft.returnJourney
      ? (draft.returnFlightNumber ?? "").trim().toUpperCase() || undefined
      : undefined,
    passengers: draft.passengers,
    suitcases: draft.suitcases,
    vehicle,
    estimatedPrice: enquiryOnly ? null : draft.quotedAmountLabel ?? null,
    isAirportTrip: true,
    airportCode: draft.airportCode,
    isFromAirport,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: TERMS_LAST_UPDATED,
    ...buildMarketingOptInFields(Boolean(draft.marketingOptIn)),
  };
}

export function validateDraftContact(draft: QuoteDraft): string | null {
  if (!draft.customerName?.trim()) return "Please enter your full name.";
  if (!draft.mobileNumber?.trim()) return "Please enter your mobile number.";
  if (!isValidMobileNumber(draft.mobileNumber)) return "Please enter a valid mobile number.";
  if (!draft.customerEmail?.trim()) return "Please enter your email address.";
  if (!isValidEmailAddress(draft.customerEmail)) return "Please enter a valid email address.";
  return null;
}

export async function submitAssistantBooking(draft: QuoteDraft): Promise<{
  ok: boolean;
  message: string;
  bookingReference?: string;
}> {
  const details = buildBookingDetailsFromDraft(draft);
  if (!details) {
    return { ok: false, message: "Booking details are incomplete — please continue in the chat." };
  }

  const enquiryOnly = isVehicleEnquiryOnly(details.vehicle);
  const mobile = detectMobileDevice();

  try {
    if (mobile) {
      const reference = enquiryOnly
        ? await submitMobileWhatsAppEnquiry({
            customerName: details.customerName,
            message: buildEnquiryBookingMessage(details),
            subject: `New enquiry — ${details.customerName}`,
            booking: details,
          })
        : await submitMobileWhatsAppBooking(details);

      openWhatsAppBookingMessage(
        enquiryOnly ? buildEnquiryBookingMessage(details) : buildBookingMessage(details),
      );

      return {
        ok: true,
        bookingReference: reference || undefined,
        message: reference
          ? `Thanks — your ${enquiryOnly ? "enquiry" : "booking"} ${reference} is logged. WhatsApp should open so you can send us the details.`
          : `Thanks — your ${enquiryOnly ? "enquiry" : "booking"} is logged. WhatsApp should open so you can send us the details.`,
      };
    }

    const reference = enquiryOnly
      ? await submitEnquiryByEmail({
          customerName: details.customerName,
          message: buildEnquiryBookingMessage(details),
          subject: `New enquiry — ${details.customerName}`,
          booking: details,
        })
      : await submitBookingByEmail(details);

    return {
      ok: true,
      bookingReference: reference || undefined,
      message: reference
        ? `Thanks — your ${enquiryOnly ? "enquiry" : "booking request"} ${reference} has been sent. We’ll confirm by email${enquiryOnly ? "" : " and send a SumUp payment link once the job is confirmed"}.`
        : `Thanks — your ${enquiryOnly ? "enquiry" : "booking request"} has been sent. We’ll confirm by email${enquiryOnly ? "" : " and send a SumUp payment link once the job is confirmed"}.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Booking could not be sent.";
    return {
      ok: false,
      message: `${detail} You can try again, or say “Speak to someone” for WhatsApp help.`,
    };
  }
}
