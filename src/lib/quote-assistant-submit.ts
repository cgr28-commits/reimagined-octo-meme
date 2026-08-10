import { AIRPORTS, SITE, isVehicleEnquiryOnly, isVehicleRequestQuote } from "@/lib/data";
import {
  isValidEmailAddress,
  isValidMobileNumber,
  type BookingDetails,
} from "@/lib/booking-message";
import { detectMobileDevice } from "@/lib/device";
import { trackRequestQuote } from "@/lib/google-ads-client";
import { buildMarketingOptInFields, recordMarketingOptIn } from "@/lib/marketing-api";
import type { QuoteDraft } from "@/lib/quote-assistant";
import {
  openWhatsAppBookingMessage,
  submitBookingByEmail,
  submitEnquiryByEmail,
  submitMobileWhatsAppBooking,
  submitMobileWhatsAppEnquiry,
} from "@/lib/submit-booking";
import { buildBookingMessage, buildEnquiryBookingMessage } from "@/lib/booking-message";
import { parseAmountValue } from "@/lib/finalize-paid-booking";
import { sendViaFormSubmitEmail } from "../../shared/email-delivery";
import { TERMS_LAST_UPDATED } from "@/lib/terms";

const WEB3FORMS_ACCESS_KEY =
  process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY?.trim() ?? "";

function buildAssistantQuoteEmail(draft: QuoteDraft): { subject: string; text: string; html: string } {
  const airportName =
    AIRPORTS.find((airport) => airport.code === draft.airportCode)?.name ?? draft.airportCode;
  const direction =
    draft.direction === "from-airport" ? `from ${airportName}` : `to ${airportName}`;
  const vehicle = (draft.vehicle ?? "Estate Car (1–4 passengers)").split(" (")[0];
  const price = draft.quotedAmountLabel ?? "See website quote";
  const returnLine = draft.returnJourney ? "Return journey (5% off)" : "One way";

  const lines = [
    `Your ${SITE.name} quote`,
    "",
    `Fixed journey price: ${price}`,
    `Trip: ${direction}`,
    `Address: ${draft.address}`,
    returnLine,
    `Vehicle: ${vehicle}`,
    `Passengers: ${draft.passengers ?? "—"}`,
    `Suitcases: ${draft.suitcases ?? "—"}`,
    "",
    "Airport pickups include up to 60 minutes complimentary waiting time after landing, plus express drop-off where applicable.",
    "",
    `Book online: ${SITE.url}`,
    `WhatsApp: @${SITE.whatsappUsername}`,
    `Call: ${SITE.landlineDisplay}`,
    `Email: ${SITE.email}`,
  ];

  const text = lines.join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0b1b33">
      <h2 style="margin:0 0 12px">Your ${SITE.name} quote</h2>
      <p style="font-size:28px;font-weight:700;margin:0 0 16px">${price}</p>
      <p style="margin:0 0 8px"><strong>Trip:</strong> ${direction}</p>
      <p style="margin:0 0 8px"><strong>Address:</strong> ${draft.address}</p>
      <p style="margin:0 0 8px"><strong>Journey:</strong> ${returnLine}</p>
      <p style="margin:0 0 8px"><strong>Vehicle:</strong> ${vehicle}</p>
      <p style="margin:0 0 8px"><strong>Passengers:</strong> ${draft.passengers ?? "—"}</p>
      <p style="margin:0 0 16px"><strong>Suitcases:</strong> ${draft.suitcases ?? "—"}</p>
      <p style="margin:0 0 16px">Airport pickups include up to 60 minutes complimentary waiting time after landing, plus express drop-off where applicable.</p>
      <p style="margin:0 0 8px"><a href="${SITE.url}">Book online</a></p>
      <p style="margin:0">WhatsApp @${SITE.whatsappUsername} · ${SITE.landlineDisplay} · ${SITE.email}</p>
    </div>
  `.trim();

  return {
    subject: `Your quote — ${price} — ${SITE.name}`,
    text,
    html,
  };
}

async function submitQuoteViaWeb3Forms(
  toEmail: string,
  subject: string,
  text: string,
  html: string,
): Promise<boolean> {
  if (!WEB3FORMS_ACCESS_KEY) {
    return false;
  }

  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: `[Quote copy] ${subject}`,
      name: toEmail,
      email: toEmail,
      from_name: SITE.name,
      message: text,
      autoresponse: {
        subject,
        message: html || text,
      },
    }),
  });

  const body = (await response.json().catch(() => null)) as { success?: unknown } | null;
  return response.ok && body?.success === true;
}

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
    !draft.termsAccepted ||
    !draft.marketingOptIn
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
  const requestQuote = isVehicleRequestQuote(vehicle);
  const estimatedPrice =
    draft.quotedAmountLabel && (requestQuote || !enquiryOnly)
      ? requestQuote
        ? `Guide price ${draft.quotedAmountLabel} (subject to availability)`
        : draft.quotedAmountLabel
      : null;

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
    estimatedPrice,
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
  const requestQuote = isVehicleRequestQuote(details.vehicle);
  const mobile = detectMobileDevice();

  try {
    let reference = "";

    if (mobile) {
      reference = enquiryOnly
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
    } else {
      reference = enquiryOnly
        ? await submitEnquiryByEmail({
            customerName: details.customerName,
            message: buildEnquiryBookingMessage(details),
            subject: `New enquiry — ${details.customerName}`,
            booking: details,
          })
        : await submitBookingByEmail(details);
    }

    if (details.marketingOptIn) {
      void recordMarketingOptIn({
        email: details.customerEmail,
        name: details.customerName,
        source: enquiryOnly ? "vehicle-enquiry" : "booking-request",
        fields: details,
      });
    }

    if (requestQuote || enquiryOnly) {
      trackRequestQuote({
        value: parseAmountValue(details.estimatedPrice ?? undefined),
        currency: "GBP",
        transactionId: reference || undefined,
        userData: {
          email: details.customerEmail,
          phone: details.mobileNumber,
        },
      });
    }

    if (mobile) {
      return {
        ok: true,
        bookingReference: reference || undefined,
        message: reference
          ? `Thanks — your ${enquiryOnly ? "enquiry" : "booking"} ${reference} is logged. WhatsApp should open so you can send us the details.`
          : `Thanks — your ${enquiryOnly ? "enquiry" : "booking"} is logged. WhatsApp should open so you can send us the details.`,
      };
    }

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
      message: `${detail} You can try again here in chat, or call ${SITE.landlineDisplay}.`,
    };
  }
}

export async function emailAssistantQuote(draft: QuoteDraft): Promise<{
  ok: boolean;
  message: string;
}> {
  const toEmail = draft.customerEmail?.trim() ?? "";
  if (!toEmail || !isValidEmailAddress(toEmail)) {
    return { ok: false, message: "Please enter a valid email address so I can send your quote." };
  }

  if (!draft.quotedAmountLabel || !draft.address || !draft.airportCode) {
    return { ok: false, message: "I don’t have a quote to email yet — say “Get a quote” first." };
  }

  const email = buildAssistantQuoteEmail(draft);

  try {
    let sent = await sendViaFormSubmitEmail({
      to: toEmail,
      subject: email.subject,
      htmlBody: email.html,
      textBody: email.text,
      fromName: SITE.name,
    });

    if (!sent) {
      sent = await submitQuoteViaWeb3Forms(toEmail, email.subject, email.text, email.html);
    }

    // Also notify the bookings inbox (best effort).
    void sendViaFormSubmitEmail({
      to: SITE.email,
      subject: `Quote emailed to customer — ${draft.quotedAmountLabel}`,
      textBody: `Quote emailed to ${toEmail}\n\n${email.text}`,
      fromName: SITE.name,
    }).catch(() => false);

    if (!sent) {
      return {
        ok: false,
        message:
          "I couldn’t send the quote email just now. You can try again or book here in chat.",
      };
    }

    return {
      ok: true,
      message: `I’ve emailed your quote to ${toEmail}. Would you like to book this trip?`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Could not send the quote email.";
    return {
      ok: false,
      message: `${detail} You can try again here in chat, or call ${SITE.landlineDisplay}.`,
    };
  }
}
