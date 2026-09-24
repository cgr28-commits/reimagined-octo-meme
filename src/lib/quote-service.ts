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
import {
  INSTANT_QUOTE_MAX_PASSENGERS,
  OWNER_QUICK_QUOTE_MAX_PASSENGERS,
  PASSENGER_LIMIT_ERROR,
} from "../../shared/passenger-limits";
import {
  PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
  isPublicMinibusVehicle,
  publicMaxPassengers,
  publicMinibusAllowed,
  type OwnerPricingSettings,
  type PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import { destinationEligibleForStandardAirportPickup } from "../../shared/airport-pickup-service-area";

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
  /**
   * Override passenger ceiling (default = instant quote band of 4).
   * Owner/Driver Quick Quote Minibus may pass up to
   * OWNER_QUICK_QUOTE_MAX_PASSENGERS (7). Public Live Quote must keep the default.
   */
  maxPassengers?: number;
  /**
   * When the airport is the pickup (BFS / BHD / DUB), require the non-airport
   * destination to be a Northern Ireland address. Owner Quick Quote may skip
   * this so staff can still compute a guide fare. Public / payment keep the default.
   */
  enforceAirportPickupServiceArea?: boolean;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationPostalCode?: string | null;
  /** Server-resolved owner pricing. Defaults reproduce current approved prices. */
  pricing?: OwnerPricingSettings | PublicOwnerPricingConfig | null;
  /** Owner/Driver Quick Quote — public Minibus OFF must not block this path. */
  ownerMode?: boolean;
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
  /** Journey fare before airport fixed costs (when the engine exposes it). */
  journeyFareGbp?: number;
  /** Night & Weekend Surcharge already included in `journeyFareGbp`. */
  nightWeekendSurchargeGbp?: number;
  /** Airport fixed costs included in `amount` (before Express / promos). */
  airportFixedCostsGbp?: number;
  source: "website-pricing-engine";
};

export type QuoteServiceFailure = {
  ok: false;
  reason:
    | "passenger_limit"
    | "incomplete"
    | "unsupported"
    | "no_fare"
    | "pricing_unavailable"
    | "vehicle_unavailable";
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
  // Reject missing selections — never coerce null/undefined/"" to 1 passenger or 0 bags.
  const rawPassengers = input.passengers as unknown;
  const rawSuitcases = input.suitcases as unknown;
  if (rawPassengers == null || rawPassengers === "") {
    return {
      ok: false,
      reason: "incomplete",
      message: "Passenger count is required.",
    };
  }
  if (rawSuitcases == null || rawSuitcases === "") {
    return {
      ok: false,
      reason: "incomplete",
      message: "Luggage count is required.",
    };
  }

  const passengers = Math.floor(Number(rawPassengers));
  const suitcases = Math.floor(Number(rawSuitcases));

  if (!Number.isFinite(passengers) || passengers < 1) {
    return {
      ok: false,
      reason: "incomplete",
      message: "Passenger count is required.",
    };
  }

  // Public default is 4. Public 7 Seater ON raises the ceiling to 7.
  // Owner Quick Quote may raise the ceiling up to 7 even when public Minibus is OFF.
  const publicMinibusEnabled = input.pricing?.minibus.publicEnabled === true;
  const defaultPublicCeiling = publicMaxPassengers(publicMinibusEnabled);
  const requestedCeiling = Math.floor(
    Number(input.maxPassengers) || defaultPublicCeiling,
  );
  const maxPassengers = Math.min(
    OWNER_QUICK_QUOTE_MAX_PASSENGERS,
    Math.max(defaultPublicCeiling, requestedCeiling),
  );

  if (passengers > maxPassengers) {
    return {
      ok: false,
      reason: "passenger_limit",
      message:
        maxPassengers > QUOTE_SERVICE_MAX_PASSENGERS
          ? `Quotes are limited to ${maxPassengers} passengers.`
          : PASSENGER_LIMIT_ERROR,
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

  // Reject missing journey mode — never coerce undefined to One Way via Boolean().
  const rawReturnJourney = (input as { returnJourney?: unknown }).returnJourney;
  const rawJourneyMode = (input as { journeyMode?: unknown }).journeyMode;
  let returnJourney: boolean;
  if (typeof rawReturnJourney === "boolean") {
    returnJourney = rawReturnJourney;
  } else if (rawJourneyMode === "one-way") {
    returnJourney = false;
  } else if (rawJourneyMode === "return") {
    returnJourney = true;
  } else {
    return {
      ok: false,
      reason: "incomplete",
      message: "Journey mode (One Way or Return) is required.",
    };
  }

  const vehicleType =
    input.vehicleType ?? selectVehicleForParty(passengers, Math.max(0, suitcases));
  if (
    !publicMinibusAllowed(vehicleType, {
      publicMinibusEnabled,
      ownerMode: input.ownerMode === true,
    })
  ) {
    return {
      ok: false,
      reason: "vehicle_unavailable",
      message: PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
    };
  }
  if (isPublicMinibusVehicle(vehicleType) && passengers > 7) {
    return {
      ok: false,
      reason: "passenger_limit",
      message: "We can only quote for up to 7 passengers in a 7 Seater Minibus.",
    };
  }
  const schedule = {
    ...buildSchedule(input),
    returnJourney,
  };
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

    if (
      input.enforceAirportPickupServiceArea !== false &&
      input.fromAirport &&
      !destinationEligibleForStandardAirportPickup({
        airportCode,
        addressText: address,
        postalCode: input.destinationPostalCode,
        lat: input.destinationLat,
        lng: input.destinationLng,
      })
    ) {
      return {
        ok: false,
        reason: "unsupported",
        message:
          "Automatic online fares for this airport pickup are for Greater Belfast destinations. Request a fixed quote and we will confirm a personal price — no automatic bookable fare.",
      };
    }

    // Airport transfers also need route metrics so distance floors / protection
    // (e.g. applyBelfastAirportDistanceFloor) cannot be silently skipped.
    if (!input.routeMetrics) {
      return {
        ok: false,
        reason: "no_fare",
        message:
          "We could not measure that route confidently. Please confirm both addresses and try again.",
      };
    }

    // calculateQuote(address, airportCode) — address is the non-airport end.
    quote = calculateQuote(
      address,
      airportCode,
      vehicleType,
      returnJourney,
      schedule,
      input.routeMetrics,
      Boolean(input.fromAirport),
      input.pricing,
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
      null,
      undefined,
      input.pricing,
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
  const journeyFareGbp =
    typeof quote.journeyFareGbp === "number" && Number.isFinite(quote.journeyFareGbp)
      ? Math.round(quote.journeyFareGbp * 100) / 100
      : undefined;
  const airportFixedCostsGbp =
    typeof quote.airportFixedCostsGbp === "number" &&
    Number.isFinite(quote.airportFixedCostsGbp)
      ? Math.round(quote.airportFixedCostsGbp * 100) / 100
      : undefined;
  const nightWeekendSurchargeGbp =
    typeof quote.nightWeekendSurchargeGbp === "number" &&
    Number.isFinite(quote.nightWeekendSurchargeGbp)
      ? Math.round(quote.nightWeekendSurchargeGbp * 100) / 100
      : undefined;

  return {
    ok: true,
    amount,
    amountLabel: formatQuote(amount),
    currency: "GBP",
    vehicleType,
    premiumApplied: Boolean(quote.premiumApplied),
    returnJourney,
    ...(journeyFareGbp != null ? { journeyFareGbp } : {}),
    ...(nightWeekendSurchargeGbp != null ? { nightWeekendSurchargeGbp } : {}),
    ...(airportFixedCostsGbp != null ? { airportFixedCostsGbp } : {}),
    source: "website-pricing-engine",
  };
}
