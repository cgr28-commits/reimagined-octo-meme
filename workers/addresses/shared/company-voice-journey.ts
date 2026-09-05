/**
 * Shared My Airport Taxi NI company-voice copy for customer email + WhatsApp.
 *
 * Owner-operated and assigned-driver-operated journeys must call these builders
 * with booking-leg data only. Operator identity, personal numbers and vehicle
 * details must never enter the customer output.
 */

import {
  resolveAirportAccessOption,
  type AirportAccessOption,
} from "./express-drop-off";
import { matchServedAirportCode } from "./served-airports";
import { formatUkTime } from "./uk-time";

export const COMPANY_VOICE_BUSINESS_NAME = "My Airport Taxi NI";

export type CompanyVoiceAirportAccessOption = AirportAccessOption;

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

/**
 * Airport meeting-point copy for the active pickup leg.
 * Depends only on airport + selected pickup option — not who pressed the button.
 */
export function buildAirportPickupInstruction(
  booking: CompanyVoiceJourneyBooking,
): string | null {
  const airportPickup =
    booking.isAirportPickup === true ||
    Boolean(matchServedAirportCode(booking.pickupLabel ?? ""));
  if (!airportPickup) return null;

  const airportCode = resolveCompanyVoiceAirportCode(booking);
  const access = resolveCompanyVoiceAirportAccessOption(booking);
  const expressAirport = airportCode === "BFS" || airportCode === "BHD";

  if (expressAirport && access === "express") {
    return "Please make your way to Express Pick-Up. Your My Airport Taxi NI driver is waiting there.";
  }
  if (expressAirport && access === "free") {
    return "Please make your way to the designated free pick-up area. It’s only a short walk from the terminal. Your My Airport Taxi NI driver is waiting there.";
  }

  return "Your My Airport Taxi NI driver is at the agreed airport pickup point and ready to meet you.";
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
  return [
    "🚕 Your driver has arrived",
    "",
    "Your My Airport Taxi NI driver is now at your pickup location and ready when you are.",
  ].join("\n");
}

export function buildArrivedAirportCompanyVoiceMessage(
  booking: CompanyVoiceJourneyBooking,
): string {
  const instruction =
    buildAirportPickupInstruction({ ...booking, isAirportPickup: true }) ||
    "Your My Airport Taxi NI driver is at the agreed airport pickup point and ready to meet you.";

  return [
    "✈️ Your driver has arrived",
    "",
    instruction,
    "",
    "Please let us know when you’re making your way outside, so your driver can be ready for you.",
  ].join("\n");
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
  const airportPickup =
    booking.isAirportPickup === true ||
    Boolean(matchServedAirportCode(booking.pickupLabel ?? ""));
  if (airportPickup) {
    const instruction =
      buildAirportPickupInstruction({ ...booking, isAirportPickup: true }) ||
      "Your My Airport Taxi NI driver is at the agreed airport pickup point and ready to meet you.";
    return `Hi ${first}, your driver has arrived at your pickup location. ${instruction} Please let us know when you’re making your way outside, so your driver can be ready for you.`;
  }
  return `Hi ${first}, your My Airport Taxi NI driver has arrived at your pickup location. Please make your way to the vehicle when ready.`;
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
];
