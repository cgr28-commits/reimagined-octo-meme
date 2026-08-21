/**
 * Single coordinate-resolution path for driving-route distance, shared by every
 * surface that needs `TripRouteMetrics` (public QuoteCard/TripMap AND Owner
 * Personal Quotes "Calculate website price").
 *
 * Root-cause context: UK street addresses selected from the GetAddress.io /
 * Ideal Postcodes premises lookups (`resolveGetAddressDetails` / the `ga:static:`
 * fast path, and the Ideal Postcodes equivalent) frequently come back with
 * `lat: null, lng: null` even though the place IS "selected" (placeId +
 * formattedAddress present). The public TripMap component already tolerates
 * this by geocoding the formatted address text as a fallback — Owner Personal
 * Quotes did not, so it silently priced with `routeMetrics = null`, which skips
 * `applyBelfastAirportDistanceFloor` (and the >100km distance-protection
 * override) inside `calculateQuote()`. That produced a lower, zone-only fare
 * that did not match the public site for the same journey.
 */

import { geocodePickupAddress } from "@/lib/google-maps";
import { fetchTripRouteMetrics, type TripRouteMetrics } from "@/lib/trip-route";
import { getServedAirport, matchServedAirportCode } from "../../shared/served-airports";

export type RoutePoint = { lat: number; lng: number };

/**
 * Resolve real-world coordinates for an address string:
 * 1. Already-known coordinates (a fully confirmed Places/Autocomplete selection).
 * 2. A recognised served airport (exact catalogue coordinates — no network call).
 * 3. Geocode the formatted address text (same fallback TripMap uses).
 */
export async function resolveRoutePoint(
  address: string,
  knownLat?: number | null,
  knownLng?: number | null,
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

  return geocodePickupAddress(trimmed);
}

/**
 * Resolve `TripRouteMetrics` for two addresses using the SAME coordinate
 * resolution as the public site, regardless of whether either end already has
 * confirmed lat/lng. Returns null when either end cannot be located.
 */
export async function resolveTripRouteMetricsForAddresses(
  origin: { address: string; lat?: number | null; lng?: number | null },
  destination: { address: string; lat?: number | null; lng?: number | null },
): Promise<TripRouteMetrics | null> {
  const [originPoint, destinationPoint] = await Promise.all([
    resolveRoutePoint(origin.address, origin.lat, origin.lng),
    resolveRoutePoint(destination.address, destination.lat, destination.lng),
  ]);

  if (!originPoint || !destinationPoint) {
    return null;
  }

  return fetchTripRouteMetrics(
    originPoint.lat,
    originPoint.lng,
    destinationPoint.lat,
    destinationPoint.lng,
  );
}
