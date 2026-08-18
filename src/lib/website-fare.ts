/**
 * One-way website fare using the SAME pricing engine as QuoteCard.
 * Always calls calculateQuote / calculatePointToPointQuote / Dublin helper
 * with returnJourney=false so Personal Quotes store one-way figures only.
 */

import { VEHICLE_TYPES, type VehicleType } from "@/lib/data";
import {
  calculateDublinCityBeyondAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
  type QuoteResult,
} from "@/lib/quote";
import type { TripRouteMetrics } from "@/lib/trip-route";
import {
  detectAirportCodeFromPlace,
  detectJourneyKind,
  isDublinCityCorridorJourney,
  isDublinCityNotAirportPlace,
  isPlaceSelected,
  type SelectedPlace,
} from "@/lib/selected-place";

export type WebsiteOneWayFareInput = {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlace: SelectedPlace | null;
  dropoffPlace: SelectedPlace | null;
  vehicleType: VehicleType;
  routeMetrics: TripRouteMetrics | null;
};

/**
 * Compute the public-website ONE-WAY fare for identical journey inputs.
 * Returns null when the public calculator would also show no live fare.
 */
export function calculateWebsiteOneWayFare(
  input: WebsiteOneWayFareInput,
): QuoteResult | null {
  const pickupAddress = input.pickupAddress.trim();
  const dropoffAddress = input.dropoffAddress.trim();
  if (!pickupAddress || !dropoffAddress) {
    return null;
  }

  const vehicleType = (VEHICLE_TYPES as readonly string[]).includes(input.vehicleType)
    ? input.vehicleType
    : VEHICLE_TYPES[0];

  const pickup = input.pickupPlace;
  const dropoff = input.dropoffPlace;
  const schedule = {}; // one-way Personal Quote standard — no return/weekend schedule at issue time
  const returnJourney = false;

  if (pickup && dropoff && isPlaceSelected(pickup) && isPlaceSelected(dropoff)) {
    const journeyKind = detectJourneyKind(pickup, dropoff);
    const pickupAirportCode = detectAirportCodeFromPlace(pickup);
    const dropoffAirportCode = detectAirportCodeFromPlace(dropoff);

    if (journeyKind === "address-to-airport" && dropoffAirportCode) {
      return calculateQuote(
        pickupAddress,
        dropoffAirportCode,
        vehicleType,
        returnJourney,
        schedule,
        input.routeMetrics,
      );
    }
    if (journeyKind === "airport-to-address" && pickupAirportCode) {
      return calculateQuote(
        dropoffAddress,
        pickupAirportCode,
        vehicleType,
        returnJourney,
        schedule,
        input.routeMetrics,
      );
    }
    if (!input.routeMetrics) {
      return null;
    }
    if (isDublinCityCorridorJourney(pickup, dropoff)) {
      const niAddress = isDublinCityNotAirportPlace(dropoff)
        ? pickupAddress
        : dropoffAddress;
      return calculateDublinCityBeyondAirportQuote(
        niAddress,
        vehicleType,
        input.routeMetrics,
        returnJourney,
        schedule,
      );
    }
    return calculatePointToPointQuote(
      pickupAddress,
      dropoffAddress,
      vehicleType,
      returnJourney,
      schedule,
      input.routeMetrics,
    );
  }

  // Fallback when places are incomplete: A2A path needs route metrics.
  if (!input.routeMetrics) {
    return null;
  }
  return calculatePointToPointQuote(
    pickupAddress,
    dropoffAddress,
    vehicleType,
    returnJourney,
    schedule,
    input.routeMetrics,
  );
}
