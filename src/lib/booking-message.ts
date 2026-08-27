import {
  formatUkDateTime,
  formatUkSubmissionTime,
} from "@/lib/format-datetime";
import {
  formatEmailFareIncludesBlock,
  resolveJourneyInclusions,
} from "@/lib/journey-inclusions";
import { formatMarketingOptInLine } from "../../shared/marketing";
import type { AdsAttribution } from "../../shared/ads-attribution";
import {
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  formatExpressDropOffSummaryLine,
} from "../../shared/express-drop-off";

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
  /** Optional Express Drop-Off add-on (BFS/BHD departures). */
  expressDropOffSelected?: boolean;
  expressDropOffFee?: number;
  expressDropOffAirport?: "BFS" | "BHD" | null;
  journeyFareBeforePromotionsGbp?: number;
  originalEligibleJourneyPriceGbp?: number;
  returnJourneySavingGbp?: number;
  firstBookingOfferApplied?: boolean;
  firstBookingSavingGbp?: number;
  totalPromotionalSavingGbp?: number;
  airportAccessChargeGbp?: number;
  journeyFareAfterPromotionsGbp?: number;
  finalAmountPayableGbp?: number;
  /** Number of child / booster seats requested (0–2). */
  childSeats?: number;
  childSeatNotes?: string;
  bookingReference?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
  cancellationPolicyVersion?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
  /** Consented, non-PII campaign attribution; never rendered in customer copy. */
  attribution?: AdsAttribution;
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
    (() => {
      const expressLine = formatExpressDropOffSummaryLine({
        expressDropOffSelected: details.expressDropOffSelected,
        expressDropOffFee: details.expressDropOffFee,
        expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
      });
      return expressLine
        ? `${expressLine}\n${EXPRESS_DROP_OFF_PASSED_ON_NOTE}\n`
        : "";
    })() +
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

/** Executive / enquiry-only booking — no online price; ask the team to quote and confirm. */
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
 * Legacy group/minibus quote helper — public site is 1–4 only.
 * Kept for callers; messaging states the capacity limit rather than advertising 5–7.
 */
export function buildGroupQuoteRequestMessage(
  details: BookingDetails,
  bookingReference?: string,
): string {
  const reference = bookingReference ?? details.bookingReference;
  const waitingNote = details.isFromAirport
    ? "Airport pickup waiting policy: up to 60 minutes complimentary waiting time."
    : "Non-airport pickup waiting policy: up to 10 minutes complimentary waiting time from the agreed pickup time.";

  return (
    `CAPACITY ENQUIRY (PUBLIC SITE MAX 4 PASSENGERS)\n` +
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
    `Note: Public website quotes and bookings are for up to 4 passengers (Saloon / Estate) only.\n` +
    `Submitted: ${formatUkSubmissionTime()}\n` +
    `\n--- Customer copy ---\n` +
    `Enquiry Received\n\n` +
    `Dear ${details.customerName},\n\n` +
    `Thank you — we’ve received your enquiry (${details.passengers} passengers).\n` +
    `My Airport Taxi NI provides private airport transfers for up to 4 passengers. ` +
    `If your party is larger than 4, please contact us and we can advise on options.\n\n` +
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
