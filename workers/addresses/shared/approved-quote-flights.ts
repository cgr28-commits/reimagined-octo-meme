import { resolvePaymentAirportContextFromAddresses } from "./open-website-payment-fares";
import {
  getAirportPickupFlightNumberBlockers,
  normalizeFlightNumber,
  requiresOutboundAirportPickupFlight,
  requiresReturnAirportPickupFlight,
} from "./flight-lookup";

type FlightBooking = {
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  flightNumber?: string;
  returnFlightNumber?: string;
};

/** The approved route is authoritative; never accept client airport/direction flags. */
export function approvedQuoteFlightRequirements(booking: FlightBooking) {
  const resolved = resolvePaymentAirportContextFromAddresses(booking.pickupLabel, booking.dropoffLabel);
  return {
    isAirportTrip: resolved.ok && resolved.context.isAirportTrip,
    isFromAirport: resolved.ok && resolved.context.fromAirport,
    airportCode: resolved.ok ? resolved.context.airportCode ?? undefined : undefined,
    outbound: resolved.ok && requiresOutboundAirportPickupFlight(resolved.context),
    inbound: resolved.ok && requiresReturnAirportPickupFlight(resolved.context, booking.returnJourney),
  };
}

export function approvedQuoteFlightBlockers(booking: FlightBooking): string[] {
  const resolved = resolvePaymentAirportContextFromAddresses(booking.pickupLabel, booking.dropoffLabel);
  return resolved.ok ? getAirportPickupFlightNumberBlockers({
    airportContext: resolved.context,
    returnJourney: booking.returnJourney,
    flightNumber: booking.flightNumber,
    returnFlightNumber: booking.returnFlightNumber,
  }) : [];
}

/** Merge only flight fields, retaining the owner's locked fare, route and party. */
export function completeApprovedQuoteFlights<T extends FlightBooking>(booking: T, details: unknown) {
  const fields = details && typeof details === "object" ? details as Record<string, unknown> : {};
  const next = {
    ...booking,
    flightNumber: normalizeFlightNumber(String(fields.flightNumber ?? booking.flightNumber ?? "")),
    returnFlightNumber: normalizeFlightNumber(String(fields.returnFlightNumber ?? booking.returnFlightNumber ?? "")),
  };
  const blockers = approvedQuoteFlightBlockers(next);
  return blockers.length > 0
    ? { ok: false as const, error: blockers[0] }
    : { ok: true as const, booking: next };
}
