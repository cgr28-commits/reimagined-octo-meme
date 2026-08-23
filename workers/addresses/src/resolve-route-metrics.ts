/**
 * Cloudflare Worker helper: resolve driving-route metrics the same way the
 * public site / Personal Quotes do (known coords → airport catalogue → geocode).
 */

import { geocodeAddress } from "../shared/google-places";
import {
  resolveTripRouteMetricsForAddresses,
  type TripRouteMetricsLike,
} from "../shared/route-metrics-resolver";
import { fetchTripRouteMetrics } from "../../../src/lib/trip-route";

export async function resolveWorkerTripRouteMetrics(options: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  googlePlacesApiKey?: string;
}): Promise<TripRouteMetricsLike | null> {
  const apiKey = options.googlePlacesApiKey?.trim() ?? "";
  const geocode = async (address: string) => {
    if (!apiKey) return null;
    return geocodeAddress(apiKey, address);
  };

  return resolveTripRouteMetricsForAddresses(
    {
      address: options.pickupAddress,
      lat: options.pickupLat,
      lng: options.pickupLng,
    },
    {
      address: options.dropoffAddress,
      lat: options.dropoffLat,
      lng: options.dropoffLng,
    },
    {
      geocode,
      fetchRouteMetrics: fetchTripRouteMetrics,
    },
  );
}
