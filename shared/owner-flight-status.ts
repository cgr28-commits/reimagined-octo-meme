/**
 * Owner Dashboard — which upcoming jobs should show Flight Status,
 * and which flight number / airport / date to look up for the active leg.
 * Pure helpers only (no API keys, no network).
 */

import { isAirportPickupLabel, activeLegPickupLabel } from "./arrival-whatsapp";
import { matchServedAirportCode } from "./served-airports";
import {
  relevantUpcomingJourneyDate,
  type LegAwareBooking,
} from "./upcoming-jobs";
import type { TripDirection } from "./flight-lookup";

export type OwnerFlightLegContext = {
  /** True when this is an airport-collection (from-airport) leg. */
  showFlightTracker: boolean;
  flightNumber: string;
  tripDate: string;
  airportCode: string;
  airportName: string;
  direction: TripDirection;
  /** True when the active unfinished leg is the return. */
  isReturnLeg: boolean;
  /** No flight number on an applicable airport collection. */
  missingFlightNumber: boolean;
};

const AIRPORT_NAMES: Record<string, string> = {
  BFS: "Belfast International",
  BHD: "George Best Belfast City",
  DUB: "Dublin Airport",
  LDY: "City of Derry",
};

export type OwnerFlightBookingFields = LegAwareBooking & {
  pickupLabel?: string;
  dropoffLabel?: string;
  flightNumber?: string | null;
  returnFlightNumber?: string | null;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
  isAirportTrip?: boolean | null;
};

/**
 * Resolve Flight Status context for the next unfinished leg on an Owner Upcoming card.
 * Tracker is for airport collections only (not ordinary drop-offs to the airport).
 */
export function resolveOwnerFlightLegContext(
  booking: OwnerFlightBookingFields,
  today?: string,
): OwnerFlightLegContext {
  const nextDate = relevantUpcomingJourneyDate(booking, today);
  const tripDate = booking.tripDate?.trim() ?? "";
  const returnDate = booking.returnDate?.trim() ?? "";
  const isReturnLeg =
    Boolean(booking.returnJourney) &&
    nextDate === returnDate &&
    nextDate !== tripDate;

  const pickupLabel = activeLegPickupLabel(booking);
  const airportFromPickup = matchServedAirportCode(pickupLabel) ?? "";
  const storedAirport = booking.airportCode?.trim().toUpperCase() ?? "";
  const airportCode = airportFromPickup || storedAirport;

  let isAirportCollection = false;
  let flightNumber = "";

  const pickupIsAirport =
    isAirportPickupLabel(pickupLabel) || Boolean(airportFromPickup);

  if (isReturnLeg) {
    // Return collection when outbound was to-airport (isFromAirport false) or pickup is an airport.
    isAirportCollection =
      booking.isFromAirport === false || pickupIsAirport;
    flightNumber = (booking.returnFlightNumber || "").trim();
  } else if (typeof booking.isFromAirport === "boolean") {
    isAirportCollection = booking.isFromAirport;
    flightNumber = (booking.flightNumber || "").trim();
  } else {
    const outboundPickup = booking.pickupLabel || "";
    isAirportCollection =
      isAirportPickupLabel(outboundPickup) ||
      Boolean(matchServedAirportCode(outboundPickup));
    flightNumber = (booking.flightNumber || "").trim();
  }

  const showFlightTracker = isAirportCollection;
  const resolvedDate =
    (/^\d{4}-\d{2}-\d{2}$/.test(nextDate) ? nextDate : "") ||
    (isReturnLeg ? returnDate : tripDate);

  return {
    showFlightTracker,
    flightNumber,
    tripDate: resolvedDate,
    airportCode,
    airportName: (AIRPORT_NAMES[airportCode] ?? airportCode) || "Airport",
    direction: "from-airport",
    isReturnLeg,
    missingFlightNumber: showFlightTracker && !flightNumber,
  };
}

export function ownerFlightCompactSummary(input: {
  flightNumber: string;
  statusCategory?: string | null;
  statusLabel?: string | null;
  estimatedTime?: string | null;
  delayMinutes?: number | null;
}): string {
  const num = input.flightNumber.trim() || "Flight";
  const status = (input.statusLabel || input.statusCategory || "").trim();
  const eta = input.estimatedTime?.trim();
  const delay =
    typeof input.delayMinutes === "number" && input.delayMinutes > 0
      ? `Delayed ${input.delayMinutes} min`
      : "";
  const parts = [num];
  if (delay) parts.push(delay);
  else if (status) parts.push(status);
  if (eta) parts.push(`ETA ${eta}`);
  return parts.join(" · ");
}
