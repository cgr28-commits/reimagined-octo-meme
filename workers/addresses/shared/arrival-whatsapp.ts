/**
 * Owner/driver Arrived at Pickup → WhatsApp click-to-chat helpers.
 * Manual Send only — no WhatsApp Business API.
 * Customer copy is company voice (My Airport Taxi NI) — never the operator's personal voice.
 */

import {
  buildArrivedCompanyVoiceWhatsAppMessage,
  buildOnTheWayCompanyVoiceMessage,
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

export function buildArrivedPickupWhatsAppMessage(options: {
  isAirportPickup: boolean;
  pickupLabel?: string;
  airportCode?: string | null;
  airportAccessOption?: "express" | "free" | null;
  expressDropOffSelected?: boolean | null;
  expressDropOffAirport?: string | null;
  expressDropOffFee?: number | null;
  /** @deprecated Vehicle details must not appear in customer WhatsApp. */
  vehicle?: ArrivalVehicleDetails | null;
}): string {
  void options.vehicle;
  return buildArrivedCompanyVoiceWhatsAppMessage({
    isAirportPickup: options.isAirportPickup,
    pickupLabel: options.pickupLabel,
    airportCode: options.airportCode,
    airportAccessOption: options.airportAccessOption,
    expressDropOffSelected: options.expressDropOffSelected,
    expressDropOffAirport: options.expressDropOffAirport,
    expressDropOffFee: options.expressDropOffFee,
  });
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
 * Company voice only — identical for owner-operated and assigned-driver journeys.
 * Manual Send only — does not automate WhatsApp Live Location.
 */
export function buildDriverOnTheWayWhatsAppMessage(options?: {
  customerName?: string;
  bookedPickupTime?: string;
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
  return buildOnTheWayCompanyVoiceMessage({
    customerName: options?.customerName,
    bookedPickupTime: options?.bookedPickupTime,
  });
}

export function buildDriverOnTheWayWhatsAppLink(
  customerMobile: string,
  options?: {
    customerName?: string;
    bookedPickupTime?: string;
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
