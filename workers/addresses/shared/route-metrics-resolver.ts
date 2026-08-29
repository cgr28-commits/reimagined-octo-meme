/**
 * Shared coordinate + route-metrics resolution for every quoting surface.
 *
 * UK premises picks (GetAddress / Ideal Postcodes) often have placeId + formatted
 * address but `lat/lng = null`. Pricing that skips `fetchTripRouteMetrics` then
 * silently omits `applyBelfastAirportDistanceFloor` inside `calculateQuote()`.
 *
 * Resolution order for each end:
 * 1. Already-known coordinates
 * 2. Served-airport catalogue (exact coords, no network)
 * 3. Optional geocode callback (Google Places text search)
 */

import {
  getServedAirport,
  matchServedAirportCode,
} from "./served-airports";

export type RoutePoint = { lat: number; lng: number };

export type TripRouteMetricsLike = {
  distanceKm: number;
  durationMinutes: number;
  /** Present when resolved via trip-route helpers — only `osrm` may price. */
  source?: "osrm" | "estimate";
};

export type GeocodeAddressFn = (
  address: string,
) => Promise<RoutePoint | null>;

export type FetchTripRouteMetricsFn = (
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
) => Promise<TripRouteMetricsLike | null>;

export async function resolveRoutePoint(
  address: string,
  knownLat: number | null | undefined,
  knownLng: number | null | undefined,
  geocode: GeocodeAddressFn,
): Promise<RoutePoint | null> {
  if (
    typeof knownLat === "number" &&
    typeof knownLng === "number" &&
    Number.isFinite(knownLat) &&
    Number.isFinite(knownLng)
  ) {
    return { lat: knownLat, lng: knownLng };
  }

  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  const airportCode = matchServedAirportCode(trimmed);
  const airport = airportCode ? getServedAirport(airportCode) : undefined;
  if (airport) {
    return { lat: airport.lat, lng: airport.lng };
  }

  if (trimmed.length < 8) {
    return null;
  }

  return geocode(trimmed);
}

export async function resolveTripRouteMetricsForAddresses(
  origin: { address: string; lat?: number | null; lng?: number | null },
  destination: { address: string; lat?: number | null; lng?: number | null },
  options: {
    geocode: GeocodeAddressFn;
    fetchRouteMetrics: FetchTripRouteMetricsFn;
  },
): Promise<TripRouteMetricsLike | null> {
  const [originPoint, destinationPoint] = await Promise.all([
    resolveRoutePoint(origin.address, origin.lat, origin.lng, options.geocode),
    resolveRoutePoint(
      destination.address,
      destination.lat,
      destination.lng,
      options.geocode,
    ),
  ]);

  if (!originPoint || !destinationPoint) {
    return null;
  }

  return options.fetchRouteMetrics(
    originPoint.lat,
    originPoint.lng,
    destinationPoint.lat,
    destinationPoint.lng,
  );
}
