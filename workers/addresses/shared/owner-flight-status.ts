/**
 * Owner Dashboard — which jobs should show Flight Status,
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

function labelIsAirport(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return false;
  return isAirportPickupLabel(trimmed) || Boolean(matchServedAirportCode(trimmed));
}

/**
 * Resolve Flight Status context for the active leg on an Owner job card.
 *
 * Tracker is for airport collections (pickup at a served airport), including
 * airport-to-airport where the collection airport has the flight number.
 * Ordinary to-airport drop-offs (pickup is an address) do not get a panel.
 *
 * Important: do not trust `isFromAirport === false` alone when the active
 * pickup label is clearly an airport (A2A / mis-tagged bookings).
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
  // Prefer the active pickup airport (correct for A2A + return legs).
  const airportCode = airportFromPickup || storedAirport;

  let isAirportCollection = false;
  let flightNumber = "";

  const pickupIsAirport = labelIsAirport(pickupLabel);

  if (isReturnLeg) {
    // Return collection: outbound was to-airport, or active pickup is an airport.
    isAirportCollection =
      pickupIsAirport || booking.isFromAirport === false;
    flightNumber = (booking.returnFlightNumber || "").trim();
  } else if (pickupIsAirport) {
    // Outbound (or single) collection — including A2A BFS→BHD etc.
    // Pickup-at-airport wins over a stale/wrong isFromAirport=false flag.
    isAirportCollection = true;
    flightNumber = (booking.flightNumber || "").trim();
  } else if (booking.isFromAirport === true) {
    isAirportCollection = true;
    flightNumber = (booking.flightNumber || "").trim();
  } else {
    // Address pickup → airport drop-off (or non-airport journey): no tracker.
    isAirportCollection = false;
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
