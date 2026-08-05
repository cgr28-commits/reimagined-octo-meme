import {
  formatUkDateTime,
  formatUkSubmissionTime,
} from "@/lib/format-datetime";
import { formatMarketingOptInLine } from "../../shared/marketing";

export type BookingDetails = {
  customerName: string;
  customerEmail: string;
  mobileNumber: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate: string;
  returnTime: string;
  flightNumber: string;
  returnFlightNumber?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  estimatedPrice: string | null;
  journeyDistance?: string;
  journeyDuration?: string;
  isAirportTrip: boolean;
  airportCode?: string;
  isFromAirport?: boolean;
  bookingReference?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
};

export function isValidMobileNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 15) {
    return false;
  }

  if (digits.startsWith("44")) {
    return digits.length >= 12;
  }

  if (digits.startsWith("0")) {
    return digits.length >= 10;
  }

  return digits.length >= 10;
}

export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildTripDetailsBlock(details: BookingDetails, bookingReference?: string): string {
  const reference = bookingReference ?? details.bookingReference;

  return (
    (reference ? `Booking reference: ${reference}\n` : "") +
    `Name: ${details.customerName}\n` +
    (details.customerEmail ? `Email: ${details.customerEmail}\n` : "") +
    (details.mobileNumber ? `Mobile: ${details.mobileNumber}\n` : "") +
    `Trip: ${details.tripLabel}\n` +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n` +
    (details.journeyDistance ? `Journey distance: ${details.journeyDistance}\n` : "") +
    (details.journeyDuration ? `Estimated journey time: ${details.journeyDuration}\n` : "") +
    `Return journey: ${details.returnJourney ? "Yes" : "No"}\n` +
    `${details.returnJourney ? "Outbound date & time" : "Date & time"}: ${formatUkDateTime(details.tripDate, details.tripTime)}\n` +
    (details.returnJourney
      ? `Return date & time: ${formatUkDateTime(details.returnDate, details.returnTime)}\n`
      : "") +
    (details.isAirportTrip && details.flightNumber
      ? `Flight number for going: ${details.flightNumber}\n`
      : "") +
    (details.isAirportTrip && details.returnFlightNumber
      ? `Flight number for collection: ${details.returnFlightNumber}\n`
      : "") +
    `Passengers: ${details.passengers}\n` +
    `Suitcases: ${details.suitcases}\n` +
    `Vehicle: ${details.vehicle}\n` +
    (details.journeyDistance && details.journeyDuration
      ? `Journey: ${details.journeyDistance} · ${details.journeyDuration}\n`
      : "") +
    (details.estimatedPrice ? `Your fixed journey price: ${details.estimatedPrice}\n` : "") +
    (details.returnJourney && details.estimatedPrice ? "Return booking discount: 5% applied\n" : "") +
    (details.termsAcceptedAt
      ? `Terms accepted: ${details.termsAcceptedAt}${details.termsVersion ? ` (${details.termsVersion})` : ""}\n`
      : "") +
    (() => {
      const marketingLine = formatMarketingOptInLine(details);
      return marketingLine ? `${marketingLine}\n` : "";
    })() +
    `Submitted: ${formatUkSubmissionTime()}\n`
  );
}

export function buildBookingMessage(details: BookingDetails, bookingReference?: string): string {
  return `Hi, I would like to book the following.\n\n` + buildTripDetailsBlock(details, bookingReference);
}

/** Executive / Minibus enquiry — no online price; ask the team to quote and confirm. */
export function buildEnquiryBookingMessage(
  details: BookingDetails,
  bookingReference?: string,
): string {
  return (
    `Hi, I would like to enquire about booking the following.\n\n` +
    buildTripDetailsBlock({ ...details, estimatedPrice: null }, bookingReference) +
    `\nPlease send me a quote and confirm availability.\n`
  );
}
