/**
 * Shared My Airport Taxi NI company-voice copy for customer email + WhatsApp.
 *
 * Owner-operated and assigned-driver-operated journeys must call these builders
 * with booking-leg data only. Operator identity, personal numbers and vehicle
 * details must never enter the customer output.
 */

import {
  parseDublinArrivalTerminal,
  type DublinArrivalTerminal,
} from "./dublin-arrival-terminal";
import {
  resolveAirportAccessOption,
  type AirportAccessOption,
} from "./express-drop-off";
import { matchServedAirportCode } from "./served-airports";
import { formatUkTime } from "./uk-time";

export const COMPANY_VOICE_BUSINESS_NAME = "My Airport Taxi NI";

export type CompanyVoiceAirportAccessOption = AirportAccessOption;

export const AIRPORT_PICKUP_HEADING = "✈️ Airport Pick-Up";

export const AIRPORT_PICKUP_COPY = {
  express: "Please make your way to Express Pick-Up.",
  bfsBhdFree:
    "Please make your way to the Long Stay Car Park Free Pick-Up Location. Please let us know when you're there so your driver can head over to meet you. Please note there is a maximum stay of 10 minutes at the Free Pick-Up Location.",
  dubT1:
    "Please make your way to the paid Pick-Up Location at Terminal 1. Please let us know when you're there so your driver can head over to meet you. Please note there is a maximum stay of 10 minutes at the Pick-Up Location.",
  dubT2:
    "Please make your way to the paid Pick-Up Location at Terminal 2. Please let us know when you're there so your driver can head over to meet you. Please note there is a maximum stay of 10 minutes at the Pick-Up Location.",
  dubUnknown:
    "Please make your way to the agreed paid Pick-Up Location at Dublin Airport. Please let us know when you're there so your driver can head over to meet you. Please note there is a maximum stay of 10 minutes at the Pick-Up Location. Your arrival terminal still needs confirmation.",
  generic: "Please make your way to the agreed airport pickup point.",
  street: "Your driver is now at your pickup location and ready when you are.",
} as const;

/** Booking-leg fields only — never operator identity or vehicle details. */
export type CompanyVoiceJourneyBooking = {
  customerName?: string;
  bookedPickupTime?: string;
  pickupLabel?: string;
  isAirportPickup?: boolean;
  airportCode?: string | null;
  airportAccessOption?: CompanyVoiceAirportAccessOption | null;
  expressDropOffSelected?: boolean | null;
  expressDropOffAirport?: string | null;
  expressDropOffFee?: number | null;
  dublinArrivalTerminal?: DublinArrivalTerminal | string | null;
};

/** Safe first-name greeting token — never empty. */
export function companyVoiceCustomerFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0];
  return first || "there";
}

export function formatBookedPickupTime(time: string): string {
  return formatUkTime(time.trim());
}

export function resolveCompanyVoiceAirportCode(
  booking: CompanyVoiceJourneyBooking,
): string | null {
  const explicit = String(booking.airportCode ?? "").trim().toUpperCase();
  if (explicit) return explicit;
  const express = String(booking.expressDropOffAirport ?? "").trim().toUpperCase();
  if (express) return express;
  return matchServedAirportCode(booking.pickupLabel ?? "");
}

export function resolveCompanyVoiceAirportAccessOption(
  booking: CompanyVoiceJourneyBooking,
): CompanyVoiceAirportAccessOption | null {
  if (booking.airportAccessOption === "express" || booking.airportAccessOption === "free") {
    return booking.airportAccessOption;
  }
  return resolveAirportAccessOption({
    expressDropOffSelected: booking.expressDropOffSelected,
    expressDropOffFee: booking.expressDropOffFee,
    expressDropOffAirport:
      booking.expressDropOffAirport ?? booking.airportCode ?? resolveCompanyVoiceAirportCode(booking),
  });
}

export function isCompanyVoiceAirportPickup(
  booking: CompanyVoiceJourneyBooking,
): boolean {
  return (
    booking.isAirportPickup === true ||
    Boolean(matchServedAirportCode(booking.pickupLabel ?? ""))
  );
}

/**
 * Airport meeting-point copy for the active pickup leg.
 * Depends only on airport + selected pickup option + Dublin terminal — not who pressed the button.
 */
export function buildAirportPickupInstruction(
  booking: CompanyVoiceJourneyBooking,
): string | null {
  if (!isCompanyVoiceAirportPickup(booking)) return null;

  const airportCode = resolveCompanyVoiceAirportCode(booking);
  const access = resolveCompanyVoiceAirportAccessOption(booking);

  if (airportCode === "BFS" || airportCode === "BHD") {
    if (access === "free") return AIRPORT_PICKUP_COPY.bfsBhdFree;
    return AIRPORT_PICKUP_COPY.express;
  }

  if (airportCode === "DUB") {
    const terminal = parseDublinArrivalTerminal(booking.dublinArrivalTerminal);
    if (terminal === "T1") return AIRPORT_PICKUP_COPY.dubT1;
    if (terminal === "T2") return AIRPORT_PICKUP_COPY.dubT2;
    return AIRPORT_PICKUP_COPY.dubUnknown;
  }

  return AIRPORT_PICKUP_COPY.generic;
}

/**
 * Exact on-the-way WhatsApp / shared email body.
 * “We” means My Airport Taxi NI.
 */
export function buildOnTheWayCompanyVoiceMessage(
  booking: Pick<CompanyVoiceJourneyBooking, "customerName" | "bookedPickupTime">,
): string {
  const first = companyVoiceCustomerFirstName(booking.customerName ?? "");
  const time = formatBookedPickupTime(booking.bookedPickupTime ?? "");
  const timeClause = time ? ` for your booked pickup time of ${time}` : "";
  return `Hi ${first}, your driver is now on the way to your pickup location${timeClause}. We may also share a live location with you here on WhatsApp.`;
}

export function buildArrivedStreetCompanyVoiceMessage(): string {
  return ["🚕 Your driver has arrived", "", AIRPORT_PICKUP_COPY.street].join("\n");
}

export function buildArrivedAirportCompanyVoiceMessage(
  booking: CompanyVoiceJourneyBooking,
): string {
  const instruction =
    buildAirportPickupInstruction({ ...booking, isAirportPickup: true }) ||
    AIRPORT_PICKUP_COPY.generic;

  return [AIRPORT_PICKUP_HEADING, "", instruction].join("\n");
}

export function buildArrivedCompanyVoiceWhatsAppMessage(
  booking: CompanyVoiceJourneyBooking & { isAirportPickup: boolean },
): string {
  return booking.isAirportPickup
    ? buildArrivedAirportCompanyVoiceMessage(booking)
    : buildArrivedStreetCompanyVoiceMessage();
}

export function buildArrivedCompanyVoiceEmailBody(
  booking: CompanyVoiceJourneyBooking,
): string {
  const first = companyVoiceCustomerFirstName(booking.customerName ?? "");
  if (isCompanyVoiceAirportPickup(booking)) {
    const instruction =
      buildAirportPickupInstruction({ ...booking, isAirportPickup: true }) ||
      AIRPORT_PICKUP_COPY.generic;
    return `Hi ${first}, ${instruction}`;
  }
  return `Hi ${first}, your driver has arrived at your pickup location. ${AIRPORT_PICKUP_COPY.street}`;
}

/** Phrases that must never appear in customer email / WhatsApp from journey buttons. */
export const FORBIDDEN_PERSONAL_VOICE_PATTERNS: RegExp[] = [
  /\bI['’]m your driver\b/i,
  /\bI['’]m on my way\b/i,
  /\bI have arrived\b/i,
  /\bI may share my location\b/i,
  /\bI may also share my live location\b/i,
  /\bI['’]m now on the way\b/i,
  /\bmy vehicle\b/i,
  /\bmy registration\b/i,
  /\bYour vehicle:\b/i,
  /\bVehicle colour:\b/i,
  /\bVehicle:\s+\w+/i,
  /\bRegistration:\s+/i,
  /your My Airport Taxi NI driver/i,
  /Your My Airport Taxi NI driver/,
  /My Airport Taxi NI driver/i,
  /driver is waiting there/i,
  /already waiting/i,
];
