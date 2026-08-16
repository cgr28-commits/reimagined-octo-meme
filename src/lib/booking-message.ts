import {
  formatUkDateTime,
  formatUkSubmissionTime,
} from "@/lib/format-datetime";
import {
  formatEmailFareIncludesBlock,
  resolveJourneyInclusions,
} from "@/lib/journey-inclusions";
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
  /** Number of child / booster seats requested (0–2). */
  childSeats?: number;
  childSeatNotes?: string;
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
  const inclusions = resolveJourneyInclusions({
    isAirportTrip: details.isAirportTrip,
    isFromAirport: Boolean(details.isFromAirport),
    returnJourney: details.returnJourney,
    airportCode: details.airportCode,
    addressToAddress: !details.isAirportTrip,
  });
  const includesBlock = details.estimatedPrice
    ? `\n${formatEmailFareIncludesBlock(inclusions, details.estimatedPrice)}\n`
    : inclusions.emailIncludeLines.length > 0
      ? `\nIncludes:\n${inclusions.emailIncludeLines.map((line) => (line.startsWith("•") || line.endsWith(":") ? line : `• ${line}`)).join("\n")}\n`
      : `\n${inclusions.summary}\n`;

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
    (typeof details.childSeats === "number" && details.childSeats > 0
      ? `Child seats: ${details.childSeats}${details.childSeatNotes ? ` (${details.childSeatNotes})` : ""}\n`
      : "") +
    `Vehicle: ${details.vehicle}\n` +
    (details.journeyDistance && details.journeyDuration
      ? `Journey: ${details.journeyDistance} · ${details.journeyDuration}\n`
      : "") +
    (details.estimatedPrice ? `Your fixed journey price: ${details.estimatedPrice}\n` : "") +
    includesBlock +
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

/**
 * Business-facing 5+ / larger-vehicle quote request.
 * Scannable on mobile — no invented price, no false "fee included" claims.
 */
export function buildGroupQuoteRequestMessage(
  details: BookingDetails,
  bookingReference?: string,
): string {
  const reference = bookingReference ?? details.bookingReference;
  const waitingNote = details.isFromAirport
    ? "Airport pickup waiting policy: 60 minutes complimentary (when a flight number is provided where possible)."
    : "Non-airport pickup waiting policy: 10 minutes complimentary from the agreed pickup time.";

  return (
    `MINIBUS / 5+ PASSENGER QUOTE REQUEST\n` +
    `${"=".repeat(36)}\n` +
    (reference ? `Reference: ${reference}\n` : "") +
    `Passengers: ${details.passengers}\n` +
    `Luggage (large bags): ${details.suitcases}\n` +
    (typeof details.childSeats === "number" && details.childSeats > 0
      ? `Child seats: ${details.childSeats}${details.childSeatNotes ? ` (${details.childSeatNotes})` : ""}\n`
      : "") +
    `Pickup: ${details.pickupLabel}\n` +
    `Destination: ${details.dropoffLabel}\n` +
    (details.airportCode ? `Airport: ${details.airportCode}\n` : "") +
    `${details.returnJourney ? "Outbound" : "Travel"}: ${formatUkDateTime(details.tripDate, details.tripTime)}\n` +
    `Return: ${details.returnJourney ? "Yes" : "No"}\n` +
    (details.returnJourney
      ? `Return date & time: ${formatUkDateTime(details.returnDate, details.returnTime)}\n`
      : "") +
    (details.flightNumber ? `Flight number: ${details.flightNumber}\n` : "") +
    (details.returnFlightNumber ? `Return flight number: ${details.returnFlightNumber}\n` : "") +
    `Customer: ${details.customerName}\n` +
    `Mobile: ${details.mobileNumber}\n` +
    `Email: ${details.customerEmail}\n` +
    `\n${waitingNote}\n` +
    `Note: Any applicable airport access fees and tolls will be included in the tailored quote.\n` +
    `Submitted: ${formatUkSubmissionTime()}\n` +
    `\n--- Customer copy ---\n` +
    `Quote Request Received\n\n` +
    `Dear ${details.customerName},\n\n` +
    `Thank you — we’ve received your journey details for a larger vehicle / group transfer.\n` +
    `This is a quote request only. A tailored fixed price will be provided shortly. ` +
    `Nothing is confirmed until you accept the quote.\n\n` +
    `Pickup: ${details.pickupLabel}\n` +
    `Destination: ${details.dropoffLabel}\n` +
    `Passengers: ${details.passengers}\n` +
    `Luggage: ${details.suitcases}\n` +
    `${details.returnJourney ? "Outbound" : "Travel"}: ${formatUkDateTime(details.tripDate, details.tripTime)}\n` +
    (details.returnJourney
      ? `Return: ${formatUkDateTime(details.returnDate, details.returnTime)}\n`
      : "")
  );
}
