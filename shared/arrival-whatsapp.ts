/**
 * Owner/driver Arrived at Pickup → WhatsApp click-to-chat helpers.
 * Manual Send only — no WhatsApp Business API.
 * Owner sessions stay in company voice. A secure saved-driver portal session
 * uses first person. Emails are not built here.
 */

import {
  buildArrivedCompanyVoiceWhatsAppMessage,
  buildArrivedDriverVoiceWhatsAppMessage,
  buildOnTheWayCompanyVoiceMessage,
  buildOnTheWayDriverVoiceMessage,
  type CompanyVoiceJourneyBooking,
} from "./company-voice-journey";

export type ArrivalVehicleDetails = {
  colour: string;
  make: string;
  model: string;
  registration: string;
};

export type CompanyVoiceWhatsAppBooking = CompanyVoiceJourneyBooking;

/** Belfast International, Belfast City, Dublin — airport pickup copy. */
export function isAirportPickupLabel(pickupLabel: string): boolean {
  const n = pickupLabel.trim().toLowerCase();
  if (!n) return false;

  if (n.includes("belfast international")) return true;
  if (n.includes("belfast city")) return true;
  if (n.includes("george best")) return true;
  if (n.includes("dublin airport")) return true;

  // Common short labels / codes on booking cards
  if (/\bbfs\b/.test(n) && (n.includes("airport") || n.includes("international") || n === "bfs")) {
    return true;
  }
  if (/\bbhd\b/.test(n) && (n.includes("airport") || n.includes("city") || n === "bhd")) {
    return true;
  }
  if (/\bdub\b/.test(n) && n.includes("airport")) return true;
  if (n === "bfs" || n === "bhd" || n === "dub") return true;

  return false;
}

/**
 * Pickup address for the active unfinished leg.
 * Return leg pickup is the original dropoff (airport ↔ address swap).
 */
export function activeLegPickupLabel(booking: {
  pickupLabel?: string;
  dropoffLabel?: string;
  returnJourney?: boolean;
  outboundJourneyStatus?: string;
  nextUnfinishedLegDate?: string;
  tripDate?: string;
  returnDate?: string;
}): string {
  if (!booking.returnJourney) {
    return booking.pickupLabel?.trim() || "";
  }

  const outboundDone = booking.outboundJourneyStatus === "completed";
  const nextIsReturn =
    Boolean(booking.nextUnfinishedLegDate?.trim()) &&
    booking.nextUnfinishedLegDate === (booking.returnDate || "").trim() &&
    booking.nextUnfinishedLegDate !== (booking.tripDate || "").trim();

  if (outboundDone || nextIsReturn) {
    return booking.dropoffLabel?.trim() || "";
  }

  return booking.pickupLabel?.trim() || "";
}

/** Booked pickup time for the active unfinished leg (return uses returnTime). */
export function activeLegPickupTime(booking: {
  returnJourney?: boolean;
  outboundJourneyStatus?: string;
  nextUnfinishedLegDate?: string;
  nextUnfinishedLegTime?: string;
  tripDate?: string;
  returnDate?: string;
  tripTime?: string;
  returnTime?: string;
}): string {
  if (!booking.returnJourney) {
    return booking.tripTime?.trim() || "";
  }

  const outboundDone = booking.outboundJourneyStatus === "completed";
  const nextIsReturn =
    Boolean(booking.nextUnfinishedLegDate?.trim()) &&
    booking.nextUnfinishedLegDate === (booking.returnDate || "").trim() &&
    booking.nextUnfinishedLegDate !== (booking.tripDate || "").trim();

  if (outboundDone || nextIsReturn) {
    return booking.nextUnfinishedLegTime?.trim() || booking.returnTime?.trim() || "";
  }

  return booking.tripTime?.trim() || "";
}

/**
 * First person only for a verified saved-driver portal session.
 * Owner sessions, shared keys, and any request-supplied voice stay company voice.
 */
export function resolveManualWhatsAppVoice(input: {
  role?: string | null;
  profileKey?: string | null;
  requestedVoice?: unknown;
  voice?: unknown;
  driverName?: unknown;
  driverFirstName?: unknown;
}): "company" | "driver" {
  void input.requestedVoice;
  void input.voice;
  void input.driverName;
  void input.driverFirstName;
  if (input.role === "driver" && input.profileKey?.trim()) {
    return "driver";
  }
  return "company";
}

function resolvedWhatsAppVoice(options?: {
  authenticatedRole?: string | null;
  voice?: unknown;
  requestedVoice?: unknown;
}): "company" | "driver" {
  void options?.voice;
  void options?.requestedVoice;
  return options?.authenticatedRole === "driver" ? "driver" : "company";
}

export function buildArrivedPickupWhatsAppMessage(options: {
  isAirportPickup: boolean;
  customerName?: string;
  pickupLabel?: string;
  airportCode?: string | null;
  airportAccessOption?: "express" | "free" | null;
  expressDropOffSelected?: boolean | null;
  expressDropOffAirport?: string | null;
  expressDropOffFee?: number | null;
  dublinArrivalTerminal?: "T1" | "T2" | string | null;
  /** Already resolved from the authenticated session. Request fields cannot set this. */
  authenticatedRole?: "owner" | "driver" | string | null;
  /** @deprecated Ignored. A request parameter must not switch the voice. */
  voice?: unknown;
  /** @deprecated Ignored. A request parameter must not switch the voice. */
  requestedVoice?: unknown;
  /** @deprecated Vehicle details must not appear in customer WhatsApp. */
  vehicle?: ArrivalVehicleDetails | null;
}): string {
  void options.vehicle;
  const booking = {
    customerName: options.customerName,
    isAirportPickup: options.isAirportPickup,
    pickupLabel: options.pickupLabel,
    airportCode: options.airportCode,
    airportAccessOption: options.airportAccessOption,
    expressDropOffSelected: options.expressDropOffSelected,
    expressDropOffAirport: options.expressDropOffAirport,
    expressDropOffFee: options.expressDropOffFee,
    dublinArrivalTerminal: options.dublinArrivalTerminal,
  };
  if (resolvedWhatsAppVoice(options) === "driver") {
    return buildArrivedDriverVoiceWhatsAppMessage(booking);
  }
  return buildArrivedCompanyVoiceWhatsAppMessage(booking);
}

/** Normalise UK/IE mobiles to WhatsApp international digits (no +). */
export function toWhatsAppDigits(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (digits.startsWith("44") || digits.startsWith("353")) return digits;
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  return digits;
}

export function buildArrivedPickupWhatsAppLink(
  customerMobile: string,
  message: string,
): string {
  const waNumber = toWhatsAppDigits(customerMobile);
  const text = encodeURIComponent(message);
  return waNumber ? `https://wa.me/${waNumber}?text=${text}` : `https://wa.me/?text=${text}`;
}

/**
 * Prefill WhatsApp opened after Driver on the way.
 * Owner sessions stay company voice. Portal-driver sessions use first person.
 * Manual Send only — does not automate WhatsApp Live Location.
 */
export function buildDriverOnTheWayWhatsAppMessage(options?: {
  customerName?: string;
  bookedPickupTime?: string;
  /** Already resolved from the authenticated session. Request fields cannot set this. */
  authenticatedRole?: "owner" | "driver" | string | null;
  /** @deprecated Ignored. A request parameter must not switch the voice. */
  voice?: unknown;
  /** @deprecated Ignored. A request parameter must not switch the voice. */
  requestedVoice?: unknown;
  /** @deprecated Operator identity must not appear in customer WhatsApp. */
  driverFirstName?: string;
  /** @deprecated Vehicle details must not appear in customer WhatsApp. */
  vehicleColour?: string;
  /** @deprecated Vehicle details must not appear in customer WhatsApp. */
  partialRegistration?: string;
  /** @deprecated Never included in customer-facing copy. */
  driverMobile?: string;
  /** @deprecated Website GPS tracking is retired — ignored. */
  trackUrl?: string;
}): string {
  void options?.driverFirstName;
  void options?.vehicleColour;
  void options?.partialRegistration;
  void options?.driverMobile;
  void options?.trackUrl;
  const booking = {
    customerName: options?.customerName,
    bookedPickupTime: options?.bookedPickupTime,
  };
  if (resolvedWhatsAppVoice(options) === "driver") {
    return buildOnTheWayDriverVoiceMessage(booking);
  }
  return buildOnTheWayCompanyVoiceMessage(booking);
}

export function buildDriverOnTheWayWhatsAppLink(
  customerMobile: string,
  options?: {
    customerName?: string;
    bookedPickupTime?: string;
    authenticatedRole?: "owner" | "driver" | string | null;
    voice?: unknown;
    requestedVoice?: unknown;
    driverFirstName?: string;
    vehicleColour?: string;
    partialRegistration?: string;
    driverMobile?: string;
    trackUrl?: string;
  },
): string {
  return buildArrivedPickupWhatsAppLink(
    customerMobile,
    buildDriverOnTheWayWhatsAppMessage(options),
  );
}
