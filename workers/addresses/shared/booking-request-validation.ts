/**
 * Conservative checks for unpaid POST /bookings requests.
 * This is not the payment endpoint: no signed receipt, fare match, or SumUp fields.
 * Tour payloads and name+message enquiries are not forced through the quote-form gate.
 */

import {
  getAirportPickupFlightNumberBlockers,
  type AirportPickupFlightContext,
} from "./flight-lookup";
import {
  PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
  publicMinibusAllowed,
} from "./owner-pricing-config";
import { getPaymentBookingBlockers } from "./paid-booking-gate";
import {
  isValidPublicPassengerCount,
  isValidPublicSuitcaseCount,
  publicPassengerLimitMessage,
  publicSuitcaseLimitMessage,
} from "./passenger-limits";
import {
  EXECUTIVE_VEHICLE_TYPE,
  publicVehicleEligibilityMessage,
} from "./executive-service";
import { isQuoteTransactionId } from "./quote-session";

const KNOWN_AIRPORT_CODES = new Set(["BFS", "BHD", "DUB", "LDY"]);

/** Paid SumUp gate wording. Unpaid requests must not show this sentence. */
const PAID_FLOW_TERMS_ERROR = "Terms must be accepted before payment.";

const UNPAID_REQUEST_TERMS_ERROR =
  "Please accept the Terms & Conditions before sending your request.";

const REQUEST_VEHICLE_TYPES = new Set([
  "Standard Saloon (1–4 passengers)",
  "Estate Car (1–4 passengers)",
  EXECUTIVE_VEHICLE_TYPE,
  "Executive Saloon (1–4 passengers)",
  "Minibus (5–7 passengers)",
]);

export type UnpaidBookingRequestInput = {
  customerName?: string | null;
  message?: string | null;
  booking?: Record<string, unknown> | null;
  tour?: Record<string, unknown> | null;
  publicMinibusEnabled?: boolean;
  now?: Date;
};

export type UnpaidBookingRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export function bookingRequestQuoteTxnKey(quoteTransactionId: string): string {
  return `booking-request:quote:${quoteTransactionId.trim()}`;
}

/**
 * Reuse an existing MATNI request only when this post already carries a real
 * quote session id and that id was stored against a request reference.
 * Missing or invented ids do not participate.
 */
export function existingRequestReferenceForQuote(input: {
  quoteTransactionId: unknown;
  storedReference: string | null | undefined;
}): string | null {
  if (!isQuoteTransactionId(input.quoteTransactionId)) return null;
  const stored = String(input.storedReference ?? "").trim();
  if (!/^MATNI-\d+$/.test(stored)) return null;
  return stored;
}

export function validateUnpaidBookingRequest(
  input: UnpaidBookingRequestInput,
): UnpaidBookingRequestResult {
  const customerName = String(input.customerName ?? "").trim();
  const message = String(input.message ?? "").trim();
  if (!customerName || !message) {
    return { ok: false, error: "Missing required fields" };
  }

  const booking = input.booking;
  if (booking && typeof booking === "object") {
    return validateStructuredBookingRequest(booking, {
      publicMinibusEnabled: input.publicMinibusEnabled === true,
      now: input.now ?? new Date(),
    });
  }

  const tour = input.tour;
  if (tour && typeof tour === "object") {
    return validateTourRequest(tour, input.now ?? new Date());
  }

  return { ok: true };
}

function validateStructuredBookingRequest(
  booking: Record<string, unknown>,
  options: { publicMinibusEnabled: boolean; now: Date },
): UnpaidBookingRequestResult {
  const blockers = getPaymentBookingBlockers({
    customerName: stringField(booking.customerName),
    customerEmail: stringField(booking.customerEmail),
    mobileNumber: stringField(booking.mobileNumber),
    tripLabel: stringField(booking.tripLabel),
    pickupLabel: stringField(booking.pickupLabel),
    dropoffLabel: stringField(booking.dropoffLabel),
    tripDate: stringField(booking.tripDate),
    tripTime: stringField(booking.tripTime),
    returnJourney: booking.returnJourney === true,
    returnDate: stringField(booking.returnDate),
    returnTime: stringField(booking.returnTime),
    vehicle: stringField(booking.vehicle),
    passengers: Number(booking.passengers),
    childSeats: booking.childSeats,
    childSeatNotes: booking.childSeatNotes,
    isAirportTrip: booking.isAirportTrip === true,
    airportCode: stringField(booking.airportCode),
    termsAcceptedAt: stringField(booking.termsAcceptedAt),
  });
  if (blockers.length > 0) {
    return { ok: false, error: unpaidCustomerError(blockers[0]) };
  }

  if (!isValidPublicPassengerCount(booking.passengers, options.publicMinibusEnabled)) {
    return { ok: false, error: publicPassengerLimitMessage(options.publicMinibusEnabled) };
  }
  if (
    booking.suitcases != null &&
    !isValidPublicSuitcaseCount(booking.suitcases, options.publicMinibusEnabled)
  ) {
    return { ok: false, error: publicSuitcaseLimitMessage(options.publicMinibusEnabled) };
  }

  const vehicle = stringField(booking.vehicle);
  if (!REQUEST_VEHICLE_TYPES.has(vehicle)) {
    return { ok: false, error: "Vehicle is not available for this request." };
  }
  const eligibilityError = publicVehicleEligibilityMessage(
    vehicle,
    Number(booking.passengers),
    Number(booking.suitcases ?? 0),
  );
  if (eligibilityError) {
    return { ok: false, error: eligibilityError };
  }
  if (
    !publicMinibusAllowed(vehicle, {
      publicMinibusEnabled: options.publicMinibusEnabled,
      ownerMode: false,
    })
  ) {
    return { ok: false, error: PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE };
  }

  const airportError = claimedAirportCodeError(booking);
  if (airportError) return { ok: false, error: airportError };

  const scheduleError = scheduleErrorForBooking(booking, options.now);
  if (scheduleError) return { ok: false, error: scheduleError };

  const flightBlockers = getAirportPickupFlightNumberBlockers({
    airportContext: flightContextFromRequest(booking),
    returnJourney: booking.returnJourney === true,
    flightNumber: stringField(booking.flightNumber),
    returnFlightNumber: stringField(booking.returnFlightNumber),
  });
  if (flightBlockers.length > 0) {
    return { ok: false, error: flightBlockers[0] };
  }

  return { ok: true };
}

function validateTourRequest(
  tour: Record<string, unknown>,
  now: Date,
): UnpaidBookingRequestResult {
  const pickup = stringField(tour.pickupLocation);
  if (!pickup) {
    return { ok: false, error: "Pickup location is required." };
  }

  const travelDate = stringField(tour.travelDate);
  if (!isRealIsoDate(travelDate)) {
    return { ok: false, error: "Travel date is not valid." };
  }
  if (travelDate < londonToday(now)) {
    return { ok: false, error: "Travel date cannot be in the past." };
  }

  const groupSize = Number(tour.groupSize);
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 4) {
    return { ok: false, error: "Group size must be between 1 and 4." };
  }

  const mobile = stringField(tour.mobileNumber);
  if (!mobile) {
    return { ok: false, error: "Mobile number is required." };
  }
  if (!isPlausibleMobile(mobile)) {
    return { ok: false, error: "Mobile number is not valid." };
  }

  const email = stringField(tour.customerEmail);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email address is not valid." };
  }

  if (!stringField(tour.termsAcceptedAt)) {
    return { ok: false, error: UNPAID_REQUEST_TERMS_ERROR };
  }

  return { ok: true };
}

function claimedAirportCodeError(booking: Record<string, unknown>): string | null {
  const codes = [
    stringField(booking.airportCode),
    stringField(booking.pickupAirportCode),
    stringField(booking.dropoffAirportCode),
  ];
  for (const code of codes) {
    if (!code) continue;
    if (!KNOWN_AIRPORT_CODES.has(code.toUpperCase())) {
      return "Airport is not recognised.";
    }
  }
  return null;
}

function flightContextFromRequest(booking: Record<string, unknown>): AirportPickupFlightContext {
  const pickupAirportCode = stringField(booking.pickupAirportCode);
  const isAirportToAirport =
    booking.isAirportToAirport === true ||
    stringField(booking.journeyKind) === "airport-to-airport";
  const fromAirport = booking.isFromAirport === true || Boolean(pickupAirportCode);
  const isAirportTrip =
    booking.isAirportTrip === true ||
    Boolean(stringField(booking.airportCode)) ||
    isAirportToAirport;
  return { fromAirport, isAirportTrip, isAirportToAirport };
}

function scheduleErrorForBooking(booking: Record<string, unknown>, now: Date): string | null {
  const tripDate = stringField(booking.tripDate);
  const tripTime = stringField(booking.tripTime);
  if (!isRealIsoDate(tripDate)) {
    return "Pickup date is not valid.";
  }
  if (!isRealTime(tripTime)) {
    return "Pickup time is not valid.";
  }
  const today = londonToday(now);
  if (tripDate < today) {
    return "Pickup date cannot be in the past.";
  }
  if (tripDate === today && tripTime.slice(0, 5) < londonTime(now)) {
    return "Pickup time cannot be in the past.";
  }

  if (booking.returnJourney === true) {
    const returnDate = stringField(booking.returnDate);
    const returnTime = stringField(booking.returnTime);
    if (!isRealIsoDate(returnDate)) {
      return "Return date is not valid.";
    }
    if (!isRealTime(returnTime)) {
      return "Return time is not valid.";
    }
    if (`${returnDate}T${returnTime.slice(0, 5)}` <= `${tripDate}T${tripTime.slice(0, 5)}`) {
      return "Return date and time must be after your outbound trip.";
    }
  }

  return null;
}

function unpaidCustomerError(message: string): string {
  if (message === PAID_FLOW_TERMS_ERROR) return UNPAID_REQUEST_TERMS_ERROR;
  return message;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isRealTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function londonToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function londonTime(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function isPlausibleMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  if (digits.startsWith("44")) return digits.length >= 12;
  return digits.length >= 10;
}
