import {
  formatUkDateTime,
  formatUkSubmissionTime,
} from "@/lib/format-datetime";
import {
  formatEmailFareIncludesBlock,
  resolveJourneyInclusions,
} from "@/lib/journey-inclusions";
import { formatMarketingOptInLine } from "../../shared/marketing";
import type { AdsAttribution, AdsMeasurementRecord } from "../../shared/ads-attribution";
import {
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  formatAirportAccessOptionCustomerLines,
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
  /** false = customer selected 5+ (five or more). true/omitted = exact count. */
  suitcasesExact?: boolean;
  vehicle: string;
  estimatedPrice: string | null;
  journeyDistance?: string;
  journeyDuration?: string;
  isAirportTrip: boolean;
  airportCode?: string;
  isFromAirport?: boolean;
  /** Present when both ends are recognised airports. */
  journeyKind?: string;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
  isAirportToAirport?: boolean;
  /** Optional Express Drop-Off add-on (BFS/BHD departures). */
  expressDropOffSelected?: boolean;
  expressDropOffFee?: number;
  expressDropOffAirport?: "BFS" | "BHD" | null;
  outboundExpressDropOffSelected?: boolean;
  returnExpressDropOffSelected?: boolean;
  airportAccessOption?: "express" | "free" | "meet-greet";
  outboundAirportAccessOption?: "express" | "free" | "meet-greet";
  returnAirportAccessOption?: "express" | "free" | "meet-greet";
  outboundAirportAccessChargeGbp?: number;
  returnAirportAccessChargeGbp?: number;
  journeyFareBeforePromotionsGbp?: number;
  originalEligibleJourneyPriceGbp?: number;
  returnJourneySavingGbp?: number;
  totalPromotionalSavingGbp?: number;
  airportAccessChargeGbp?: number;
  journeyFareAfterPromotionsGbp?: number;
  nightWeekendSurchargeGbp?: number;
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
  /** Consent state and attribution outcome. Never contains a click ID. */
  adsMeasurement?: AdsMeasurementRecord;
  /** Quote session id — matches the daily owner quote report, not shown to customers. */
  quoteTransactionId?: string;
  /** Optional. Requests stay valid when a flow does not collect a Google place id. */
  pickupPlaceId?: string;
  dropoffPlaceId?: string;
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

export function normalizeChildSeats(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(2, Math.floor(parsed));
}

export function formatChildSeatsLine(
  childSeats?: number,
  childSeatNotes?: string,
): string {
  const seats = normalizeChildSeats(childSeats);
  if (seats <= 0) return "";
  const notes = childSeatNotes?.trim();
  return `Child seats: ${seats}${notes ? ` (${notes})` : ""}`;
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
    (reference ? `Request reference: ${reference}\n` : "") +
    `Name: ${details.customerName}\n` +
    (details.customerEmail ? `Email: ${details.customerEmail}\n` : "") +
    (details.mobileNumber ? `Mobile: ${details.mobileNumber}\n` : "") +
    `Trip: ${details.tripLabel}\n` +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n` +
    (details.journeyDuration ? `Approx. ${details.journeyDuration}\n` : "") +
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
    (() => {
      const childSeatsLine = formatChildSeatsLine(details.childSeats, details.childSeatNotes);
      return childSeatsLine ? `${childSeatsLine}\n` : "";
    })() +
    `Vehicle: ${details.vehicle}\n` +
    (details.estimatedPrice ? `Your fixed journey price: ${details.estimatedPrice}\n` : "") +
    (() => {
      const accessLines = formatAirportAccessOptionCustomerLines({
        expressDropOffSelected: details.expressDropOffSelected,
        expressDropOffFee: details.expressDropOffFee,
        expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
        airportCode: details.airportCode,
        fromAirport: details.isFromAirport,
        returnJourney: details.returnJourney,
        isAirportToAirport: details.isAirportToAirport,
        pickupAirportCode: details.pickupAirportCode,
        dropoffAirportCode: details.dropoffAirportCode,
        outboundExpressDropOffSelected: details.outboundExpressDropOffSelected,
        returnExpressDropOffSelected: details.returnExpressDropOffSelected,
        outboundAirportAccessOption: details.outboundAirportAccessOption,
        returnAirportAccessOption: details.returnAirportAccessOption,
        airportAccessOption: details.airportAccessOption,
        outboundAirportAccessChargeGbp: details.outboundAirportAccessChargeGbp,
        returnAirportAccessChargeGbp: details.returnAirportAccessChargeGbp,
      });
      const expressLine = formatExpressDropOffSummaryLine({
        expressDropOffSelected: details.expressDropOffSelected,
        expressDropOffFee: details.expressDropOffFee,
        expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
        fromAirport: details.isFromAirport,
      });
      if (accessLines.length === 0 && !expressLine) return "";
      const meetGreetShown = accessLines.some((line) => line.includes("Meet & Greet"));
      return (
        (accessLines.length > 0 ? `${accessLines.join("\n")}\n` : "") +
        (expressLine &&
        !meetGreetShown &&
        !accessLines.some((line) => line.includes(expressLine))
          ? `${expressLine}\n`
          : "") +
        `${EXPRESS_DROP_OFF_PASSED_ON_NOTE}\n`
      );
    })() +
    includesBlock +
    (details.returnJourney && details.estimatedPrice ? "5% Return Booking Discount applied\n" : "") +
    ((details.nightWeekendSurchargeGbp ?? 0) > 0
      ? "Night & Weekend Surcharge (10%) applied\n"
      : "") +
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
  return `Hi, I would like to request the following.\n\n` + buildTripDetailsBlock(details, bookingReference);
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
 * Legacy group/minibus capacity enquiry helper.
 * Kept for callers; group availability must be confirmed.
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
    `CAPACITY ENQUIRY\n` +
    `${"=".repeat(36)}\n` +
    (reference ? `Reference: ${reference}\n` : "") +
    `Passengers: ${details.passengers}\n` +
    `Standard suitcases (23kg): ${details.suitcases}\n` +
    (() => {
      const childSeatsLine = formatChildSeatsLine(details.childSeats, details.childSeatNotes);
      return childSeatsLine ? `${childSeatsLine}\n` : "";
    })() +
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
    `Note: Cars carry up to 4 passengers; a 7 Seater Minibus carries up to 7 when available. Larger groups need availability confirmation.\n` +
    `Submitted: ${formatUkSubmissionTime()}\n` +
    `\n--- Customer copy ---\n` +
    `Enquiry Received\n\n` +
    `Dear ${details.customerName},\n\n` +
    `Thank you — we’ve received your enquiry (${details.passengers} passengers).\n` +
    `My Airport Taxi NI offers cars for up to 4 passengers and a 7 Seater Minibus when available. ` +
    `We will confirm the options for your passenger and luggage numbers.\n\n` +
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
