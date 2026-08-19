/**
 * Authoritative website quote service — single entry for website + Quick Quote.
 * Recalculates fares with the SAME engine as QuoteCard (`calculateQuote` /
 * `calculatePointToPointQuote`). Never trust client- or chat-supplied amounts.
 */

import { calculatePointToPointQuote, calculateQuote, formatQuote } from "./quote";
import type { TripSchedule } from "./point-to-point-premium";
import type { TripRouteMetrics } from "./trip-route";
import { selectVehicleForParty } from "./vehicle-selection";
import type { VehicleType } from "./data";
import { INSTANT_QUOTE_MAX_PASSENGERS } from "../../shared/passenger-limits";

export const QUOTE_SERVICE_MAX_PASSENGERS = INSTANT_QUOTE_MAX_PASSENGERS; // 4

export type QuoteServiceAirportCode = "BFS" | "BHD" | "DUB" | "LDY";

export type QuoteServiceInput = {
  /** Airport transfer: address ↔ airport. Omit airportCode for address-to-address. */
  airportCode?: QuoteServiceAirportCode | null;
  /** When airport set: true = pickup at airport, false = drop-off at airport. */
  fromAirport?: boolean;
  pickupAddress: string;
  dropoffAddress?: string;
  returnJourney: boolean;
  /** Optional for quote calculation / Save Quote — required before payment. */
  outboundDate?: string;
  outboundTime?: string;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  routeMetrics?: TripRouteMetrics | null;
  /** Optional override — normally derived from passengers/suitcases. */
  vehicleType?: VehicleType;
};

export type QuoteServiceSuccess = {
  ok: true;
  amount: number;
  amountLabel: string;
  currency: "GBP";
  vehicleType: VehicleType;
  premiumApplied: boolean;
  returnJourney: boolean;
  oneWayAmount?: number;
  source: "website-pricing-engine";
};

export type QuoteServiceFailure = {
  ok: false;
  reason:
    | "passenger_limit"
    | "incomplete"
    | "unsupported"
    | "no_fare"
    | "pricing_unavailable";
  message: string;
};

export type QuoteServiceResult = QuoteServiceSuccess | QuoteServiceFailure;

function buildSchedule(input: QuoteServiceInput): TripSchedule {
  return {
    outboundDate: input.outboundDate || undefined,
    outboundTime: input.outboundTime || undefined,
    returnDate: input.returnDate || undefined,
    returnTime: input.returnTime || undefined,
    returnJourney: Boolean(input.returnJourney),
  };
}

/**
 * Calculate the fixed website fare for a complete journey.
 * Returns no_fare / handoff guidance when the public calculator would not show a price.
 */
export function calculateAuthoritativeWebsiteQuote(
  input: QuoteServiceInput,
): QuoteServiceResult {
  const passengers = Math.floor(Number(input.passengers));
  const suitcases = Math.floor(Number(input.suitcases));

  if (!Number.isFinite(passengers) || passengers < 1) {
    return {
      ok: false,
      reason: "incomplete",
      message: "Passenger count is required.",
    };
  }

  if (passengers > QUOTE_SERVICE_MAX_PASSENGERS) {
    return {
      ok: false,
      reason: "passenger_limit",
      message: `Online quotes are limited to ${QUOTE_SERVICE_MAX_PASSENGERS} passengers. Please speak to Colin for larger parties.`,
    };
  }

  if (!Number.isFinite(suitcases) || suitcases < 0) {
    return {
      ok: false,
      reason: "incomplete",
      message: "Luggage count is required.",
    };
  }

  const pickup = input.pickupAddress.trim();
  if (!pickup) {
    return {
      ok: false,
      reason: "incomplete",
      message: "Pickup address is required.",
    };
  }

  // Date/time are optional for quote calculation / Save Quote.
  // Booking and payment still require them via paid-booking-gate.

  const vehicleType =
    input.vehicleType ?? selectVehicleForParty(passengers, Math.max(0, suitcases));
  const schedule = buildSchedule(input);
  const returnJourney = Boolean(input.returnJourney);
  const airportCode = input.airportCode ?? null;

  let quote = null as ReturnType<typeof calculateQuote>;

  if (airportCode) {
    const address = input.fromAirport
      ? (input.dropoffAddress ?? "").trim()
      : pickup;
    const airportSideOk = input.fromAirport
      ? Boolean(address)
      : Boolean((input.dropoffAddress ?? pickup).trim());

    if (!address || !airportSideOk) {
      return {
        ok: false,
        reason: "incomplete",
        message: "Both pickup and destination are required for an airport transfer.",
      };
    }

    // calculateQuote(address, airportCode) — address is the non-airport end.
    quote = calculateQuote(
      address,
      airportCode,
      vehicleType,
      returnJourney,
      schedule,
      input.routeMetrics ?? null,
    );
  } else {
    const dropoff = (input.dropoffAddress ?? "").trim();
    if (!dropoff) {
      return {
        ok: false,
        reason: "incomplete",
        message: "Destination address is required.",
      };
    }
    if (!input.routeMetrics) {
      return {
        ok: false,
        reason: "no_fare",
        message:
          "We could not measure that route confidently. Please speak to Colin for a personal quote.",
      };
    }
    quote = calculatePointToPointQuote(
      pickup,
      dropoff,
      vehicleType,
      returnJourney,
      schedule,
      input.routeMetrics,
    );
  }

  if (!quote || !Number.isFinite(quote.amount) || quote.amount < 1) {
    return {
      ok: false,
      reason: "no_fare",
      message:
        "We could not calculate a fixed online fare for that journey. Please speak to Colin and we will help.",
    };
  }

  const amount = Math.round(quote.amount * 100) / 100;

  return {
    ok: true,
    amount,
    amountLabel: formatQuote(amount),
    currency: "GBP",
    vehicleType,
    premiumApplied: Boolean(quote.premiumApplied),
    returnJourney,
    source: "website-pricing-engine",
  };
}
