import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  buildBusinessBookingNotificationEmail,
  buildCustomerBookingRequestEmail,
  type BookingRequestEmailDetails,
} from "../../../../shared/booking-request-emails";
import {
  resolveBookingFromHeader,
  resolveBookingNotificationEmail,
} from "../../../../shared/email-config";
import { formatBookingReference } from "../../../../shared/booking-reference";

export const runtime = "nodejs";

type BookingPayload = {
  customerName?: string;
  message?: string;
  subject?: string;
  sendEmail?: boolean;
  companyWebsite?: string;
  booking?: Record<string, unknown>;
  tour?: Record<string, unknown>;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateBookingReference(): string {
  const now = new Date();
  const london = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const yy = london.find((p) => p.type === "year")?.value ?? "00";
  const mm = london.find((p) => p.type === "month")?.value ?? "00";
  const dd = london.find((p) => p.type === "day")?.value ?? "00";
  const rand = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `MATNI-${yy}${mm}${dd}-${rand}`;
}

function toEmailDetails(
  body: BookingPayload,
  bookingReference: string,
): BookingRequestEmailDetails {
  const booking = body.booking ?? {};
  const tour = body.tour ?? {};
  const customerName =
    readString(booking.customerName) ||
    readString(tour.customerName) ||
    readString(body.customerName) ||
    "Customer";

  const estimatedPrice = readString(booking.estimatedPrice) || null;
  const message = readString(body.message);
  const isEnquiry =
    !estimatedPrice ||
    /enquire about booking|enquiry only|Please send me a quote|Price confirmation/i.test(message);

  if (Object.keys(booking).length > 0) {
    return {
      customerName,
      customerEmail: readString(booking.customerEmail),
      mobileNumber: readString(booking.mobileNumber),
      bookingReference,
      tripLabel: readString(booking.tripLabel),
      pickupLabel: readString(booking.pickupLabel),
      dropoffLabel: readString(booking.dropoffLabel),
      airportCode: readString(booking.airportCode),
      flightNumber: readString(booking.flightNumber),
      returnFlightNumber: readString(booking.returnFlightNumber),
      tripDate: readString(booking.tripDate),
      tripTime: readString(booking.tripTime),
      returnJourney: booking.returnJourney === true,
      returnDate: readString(booking.returnDate),
      returnTime: readString(booking.returnTime),
      passengers: typeof booking.passengers === "number" ? booking.passengers : readString(booking.passengers),
      suitcases: typeof booking.suitcases === "number" ? booking.suitcases : readString(booking.suitcases),
      vehicle: readString(booking.vehicle),
      estimatedPrice,
      journeyDistance: readString(booking.journeyDistance),
      journeyDuration: readString(booking.journeyDuration),
      childSeats: readString(booking.childSeats),
      notes: readString(booking.notes),
      isAirportTrip: booking.isAirportTrip === true,
      isEnquiry,
    };
  }

  if (Object.keys(tour).length > 0) {
    return {
      customerName,
      customerEmail: readString(tour.customerEmail),
      mobileNumber: readString(tour.mobileNumber),
      bookingReference,
      tripLabel: readString(tour.tourTitle) || readString(tour.tourName) || "Day trip enquiry",
      pickupLabel: readString(tour.pickupLocation),
      tripDate: readString(tour.travelDate),
      passengers:
        typeof tour.groupSize === "number"
          ? tour.groupSize
          : typeof tour.passengers === "number"
            ? tour.passengers
            : readString(tour.groupSize) || readString(tour.passengers),
      notes: readString(tour.notes),
      isEnquiry: true,
    };
  }

  return {
    customerName,
    bookingReference,
    notes: message,
    isEnquiry: true,
  };
}

function failure(status = 400) {
  return NextResponse.json(
    { success: false, error: "Unable to submit booking. Please try again." },
    { status },
  );
}

export async function POST(request: Request) {
  let body: BookingPayload;

  try {
    body = (await request.json()) as BookingPayload;
  } catch {
    return failure(400);
  }

  // Honeypot — bots fill hidden fields.
  if (readString(body.companyWebsite)) {
    return NextResponse.json({
      success: true,
      bookingReference: formatBookingReference(1001),
    });
  }

  const customerName = readString(body.customerName);
  const message = readString(body.message);
  if (!customerName || !message) {
    return failure(400);
  }

  const bookingEmail = readString(body.booking?.customerEmail);
  const tourEmail = readString(body.tour?.customerEmail);
  const customerEmail = bookingEmail || tourEmail;
  if (customerEmail && !isValidEmail(customerEmail)) {
    return failure(400);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  if (!apiKey) {
    console.error("RESEND_API_KEY missing on Next.js booking API");
    return failure(503);
  }

  const env = {
    RESEND_API_KEY: apiKey,
    BOOKING_FROM_EMAIL: process.env.BOOKING_FROM_EMAIL,
    BOOKING_NOTIFICATION_EMAIL: process.env.BOOKING_NOTIFICATION_EMAIL,
    BOOKING_TO_EMAIL: process.env.BOOKING_TO_EMAIL,
  };

  const bookingReference = generateBookingReference();
  const details = toEmailDetails(body, bookingReference);
  const shouldSendEmail = body.sendEmail !== false;

  if (!shouldSendEmail) {
    return NextResponse.json({ success: true, bookingReference });
  }

  try {
    const resend = new Resend(apiKey);
    const from = resolveBookingFromHeader(env);
    const business = buildBusinessBookingNotificationEmail(details);

    const businessSend = await resend.emails.send({
      from,
      to: resolveBookingNotificationEmail(env),
      subject: business.subject,
      text: business.text,
      html: business.html,
      replyTo: details.customerEmail || undefined,
    });

    if (businessSend.error) {
      console.error("Resend business notification failed", businessSend.error.message);
      return failure(502);
    }

    if (details.customerEmail) {
      const customer = buildCustomerBookingRequestEmail(details);
      const customerSend = await resend.emails.send({
        from,
        to: details.customerEmail,
        subject: customer.subject,
        text: customer.text,
        html: customer.html,
      });
      if (customerSend.error) {
        console.error("Resend customer confirmation failed", customerSend.error.message);
      }
    }

    return NextResponse.json({ success: true, bookingReference });
  } catch (error) {
    console.error("Next booking API failed", error instanceof Error ? error.message : "unknown");
    return failure(502);
  }
}
