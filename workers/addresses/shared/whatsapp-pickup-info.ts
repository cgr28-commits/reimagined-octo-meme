/**
 * WhatsApp assistant: "Where do I get picked up?" — find the customer's paid
 * booking and reply with the collection directions, map and (when configured) a pin.
 *
 * Directions reuse the airport collection email copy so WhatsApp never says
 * something different from what the customer was emailed.
 */
import {
  buildAirportPickupReminderDirections,
  isCancelledBooking,
  resolveReminderAirportAccess,
  type AirportPickupReminderInput,
} from "./airport-pickup-reminder";
import { BELFAST_CITY_MAP_IMAGE_URL } from "./belfast-city-airport-map";
import { BELFAST_INTERNATIONAL_MAP_IMAGE_URL } from "./belfast-international-airport-map";
import { normalizeCustomerBookingReference } from "./customer-booking-reference";
import { DUBLIN_AIRPORT_MAP_IMAGE_URL } from "./dublin-airport-map";
import type { PaidBookingRecord } from "./paid-booking-record";
import { matchServedAirportCode } from "./served-airports";
import { formatUkDate, formatUkTime, parseLondonLocalDateTime } from "./uk-time";

export type WhatsAppPickupPin = { latitude: number; longitude: number; name: string; address?: string };

/**
 * Exact meeting points, keyed `AIRPORT:access` (access = express | free | meet-greet)
 * or just `DUB`. A pin is only sent for keys listed here — never a guessed location.
 */
export const WHATSAPP_PICKUP_PINS: Record<string, WhatsAppPickupPin> = {};

const PICKUP_QUESTION =
  /\b(where|which)\b[^?]{0,40}\b(pick(ed|ing)?\s*(me\s*)?up|pickup|collect(ed|ion)?|meet(ing)?|wait|find (you|the driver|my driver))\b|\b(pick\s*-?\s*up|collection|meeting)\s+(point|location|place|spot|area)\b/i;

export function isWhatsAppPickupLocationQuestion(text: string): boolean {
  return PICKUP_QUESTION.test(text);
}

export function extractCustomerBookingReference(text: string): string | null {
  const match = text.match(/\bMAT\s*-?\s*(\d{4})\b/i);
  return match ? normalizeCustomerBookingReference(`MAT-${match[1]}`) : null;
}

/** Same phone when the last 10 digits match (handles +44 / 07… / 44… forms). */
export function sameCustomerPhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const tail = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "").slice(-10);
  const x = tail(a);
  return x.length === 10 && x === tail(b);
}

/** Collection leg input for the email/WhatsApp directions, built from the paid booking. */
export function paidBookingPickupLeg(
  paid: PaidBookingRecord,
  leg: "outbound" | "return",
): AirportPickupReminderInput {
  const ret = leg === "return";
  return {
    customerName: paid.customerName,
    pickupLabel: ret ? paid.dropoffLabel : paid.pickupLabel,
    dropoffLabel: ret ? paid.pickupLabel : paid.dropoffLabel,
    tripDate: ret ? paid.returnDate : paid.tripDate,
    tripTime: ret ? paid.returnTime : paid.tripTime,
    journeyLeg: leg,
    isFromAirport: typeof paid.isFromAirport === "boolean" ? (ret ? !paid.isFromAirport : paid.isFromAirport) : null,
    airportCode: paid.airportCode,
    flightNumber: ret ? paid.returnFlightNumber : paid.flightNumber,
    airportAccessOption: paid.airportAccessOption,
    terminalAccessVisits: paid.terminalAccessVisits,
    outboundAirportAccessOption: paid.outboundAirportAccessOption,
    returnAirportAccessOption: paid.returnAirportAccessOption,
    expressDropOffSelected: paid.expressDropOffSelected,
    outboundExpressDropOffSelected: paid.outboundExpressDropOffSelected,
    returnExpressDropOffSelected: paid.returnExpressDropOffSelected,
    expressDropOffFee: ret ? paid.returnAirportAccessChargeGbp : (paid.outboundAirportAccessChargeGbp ?? paid.expressDropOffFee),
    expressDropOffAirport: paid.expressDropOffAirport,
    dublinArrivalTerminal: paid.dublinArrivalTerminal,
    returnDublinArrivalTerminal: paid.returnDublinArrivalTerminal,
    refundedAt: paid.refundedAt,
    operationalStatus: paid.operationalStatus,
    bookingStatus: paid.status,
    cancelledLegs: paid.cancelledLegs,
    outboundCancelledAt: paid.outboundCancelledAt,
    returnCancelledAt: paid.returnCancelledAt,
    isRefundTest: paid.isRefundTest,
    customerReference: paid.customerReference,
  };
}

/** Airport collections still ahead (or up to 3h ago, for delayed flights), soonest first. */
export function upcomingAirportCollections(
  bookings: PaidBookingRecord[],
  now: Date = new Date(),
): AirportPickupReminderInput[] {
  const cutoff = now.getTime() - 3 * 60 * 60 * 1000;
  const legs: Array<{ at: number; input: AirportPickupReminderInput }> = [];
  for (const paid of bookings) {
    const candidates = paid.returnJourney ? (["outbound", "return"] as const) : (["outbound"] as const);
    for (const leg of candidates) {
      const input = paidBookingPickupLeg(paid, leg);
      if (input.isFromAirport === false || isCancelledBooking(input)) continue;
      if (!matchServedAirportCode(input.pickupLabel ?? "")) continue;
      const at = parseLondonLocalDateTime(input.tripDate ?? "", input.tripTime ?? "")?.getTime();
      if (at == null || at < cutoff) continue;
      legs.push({ at, input });
    }
  }
  return legs.sort((a, b) => a.at - b.at).map((l) => l.input);
}

export type WhatsAppPickupInfo = {
  text: string;
  mapImageUrl: string | null;
  pin: WhatsAppPickupPin | null;
};

export function buildWhatsAppPickupInfo(input: AirportPickupReminderInput): WhatsAppPickupInfo | null {
  const directions = buildAirportPickupReminderDirections(input);
  const airport = matchServedAirportCode(input.pickupLabel ?? "");
  if (!directions || (airport !== "BFS" && airport !== "BHD" && airport !== "DUB")) return null;
  const access = resolveReminderAirportAccess(input, airport);

  // Same rule as the collection email: the Belfast maps mark the Express area only.
  const mapImageUrl =
    airport === "DUB"
      ? DUBLIN_AIRPORT_MAP_IMAGE_URL
      : access === "express"
        ? airport === "BFS"
          ? BELFAST_INTERNATIONAL_MAP_IMAGE_URL
          : BELFAST_CITY_MAP_IMAGE_URL
        : null;
  const pin = WHATSAPP_PICKUP_PINS[airport === "DUB" ? "DUB" : `${airport}:${access}`] ?? null;

  const when = [formatUkDate(input.tripDate ?? ""), formatUkTime(input.tripTime ?? "")].filter(Boolean).join(" at ");
  const ref = input.customerReference ? ` (${input.customerReference})` : "";
  const text =
    `📍 *Your airport pickup${ref}*\n` +
    `${input.pickupLabel}${when ? `, ${when}` : ""}\n\n` +
    `${directions}` +
    (mapImageUrl ? `\n\nI've sent the map below.` : "");
  return { text, mapImageUrl, pin };
}

export const WHATSAPP_PICKUP_NOT_FOUND_REPLY =
  "I couldn't find an upcoming airport pickup booked with this WhatsApp number.\n\n" +
  "Please send your booking reference (it starts with *MAT-*, e.g. MAT-1234) and I'll send your pickup point.";
