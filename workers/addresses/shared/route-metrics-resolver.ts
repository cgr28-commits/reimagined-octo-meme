/**
 * Shared coordinate + route-metrics resolution for every quoting surface.
 *
 * UK premises picks (GetAddress / Ideal Postcodes) often have placeId + formatted
 * address but `lat/lng = null`. Pricing that skips `fetchTripRouteMetrics` then
 * silently omits distance-based floors / universal road miles.
 *
 * Resolution order for each end:
 * 1. Served-airport catalogue by placeId (exact coords, no network)
 * 2. Served-airport catalogue by address label
 * 3. Already-known coordinates (quote path only — payment must not trust client lat/lng)
 * 4. Place-ID lookup via provider callback (Google / Ideal / GetAddress)
 * 5. Optional text geocode callback (Google Places text search) as fallback
 */

import {
  getServedAirport,
  matchServedAirportCode,
  servedAirportFromPlaceId,
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

/**
 * Resolve a selected place ID to coordinates using server-side provider keys.
 * `providerError` means Google/GetAddress failed transiently — not a bad selection.
 */
export type ResolvePlaceIdCoordinatesFn = (
  placeId: string,
  addressHint?: string,
) => Promise<{
  point: RoutePoint | null;
  providerError?: boolean;
}>;

export type RouteResolveFailureReason =
  | "missing_endpoint"
  | "place_unresolved"
  | "provider_unavailable"
  | "routing_unavailable";

export type RouteResolveOutcome =
  | {
      ok: true;
      metrics: TripRouteMetricsLike;
      pickup?: RoutePoint;
      dropoff?: RoutePoint;
    }
  | {
      ok: false;
      reason: RouteResolveFailureReason;
      /** Which end failed when known. */
      endpoint?: "pickup" | "dropoff" | "route";
    };

function isFiniteCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  );
}

export async function resolveRoutePoint(
  address: string,
  knownLat: number | null | undefined,
  knownLng: number | null | undefined,
  geocode: GeocodeAddressFn,
): Promise<RoutePoint | null> {
  if (isFiniteCoord(knownLat, knownLng)) {
    return { lat: knownLat as number, lng: knownLng as number };
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

/**
 * Payment / quote resolution with place IDs.
 * Prefer catalogue + place-ID lookup; text geocode is fallback only.
 */
export async function resolveRoutePointWithPlaceId(options: {
  address: string;
  placeId?: string | null;
  /** When true, trust knownLat/Lng (quote surfaces). Payment must pass false. */
  trustClientCoordinates?: boolean;
  knownLat?: number | null;
  knownLng?: number | null;
  geocode: GeocodeAddressFn;
  resolvePlaceId?: ResolvePlaceIdCoordinatesFn;
}): Promise<{
  point: RoutePoint | null;
  providerError?: boolean;
  source?: "served-airport" | "client-coords" | "place-id" | "geocode";
}> {
  const placeId = String(options.placeId ?? "").trim();
  const trimmed = options.address.trim();

  if (placeId) {
    const servedById = servedAirportFromPlaceId(placeId);
    if (servedById) {
      return {
        point: { lat: servedById.lat, lng: servedById.lng },
        source: "served-airport",
      };
    }
  }

  if (trimmed) {
    const airportCode = matchServedAirportCode(trimmed);
    const airport = airportCode ? getServedAirport(airportCode) : undefined;
    if (airport) {
      return {
        point: { lat: airport.lat, lng: airport.lng },
        source: "served-airport",
      };
    }
  }

  if (
    options.trustClientCoordinates &&
    isFiniteCoord(options.knownLat, options.knownLng)
  ) {
    return {
      point: { lat: options.knownLat as number, lng: options.knownLng as number },
      source: "client-coords",
    };
  }

  if (placeId && options.resolvePlaceId) {
    const resolved = await options.resolvePlaceId(placeId, trimmed || undefined);
    if (resolved.point) {
      return { point: resolved.point, source: "place-id" };
    }
    if (resolved.providerError) {
      // Still try text geocode as a soft fallback when the place provider blipped.
      if (trimmed.length >= 8) {
        const geocoded = await options.geocode(trimmed);
        if (geocoded) {
          return { point: geocoded, source: "geocode" };
        }
      }
      return { point: null, providerError: true };
    }
  }

  if (trimmed.length >= 8) {
    const geocoded = await options.geocode(trimmed);
    if (geocoded) {
      return { point: geocoded, source: "geocode" };
    }
  }

  return { point: null };
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

/**
 * Full outcome-aware resolve used by SumUp payment (and tests).
 * Never invents metrics. Distinguishes bad places from temporary provider/OSRM failures.
 */
export async function resolveTripRouteMetricsOutcome(options: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  /** Payment must leave this false — never trust browser lat/lng for SumUp. */
  trustClientCoordinates?: boolean;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  geocode: GeocodeAddressFn;
  resolvePlaceId?: ResolvePlaceIdCoordinatesFn;
  fetchRouteMetrics: FetchTripRouteMetricsFn;
}): Promise<RouteResolveOutcome> {
  const pickupLabel = options.pickupAddress.trim();
  const dropoffLabel = options.dropoffAddress.trim();
  if (!pickupLabel || !dropoffLabel) {
    return { ok: false, reason: "missing_endpoint" };
  }

  const [origin, destination] = await Promise.all([
    resolveRoutePointWithPlaceId({
      address: pickupLabel,
      placeId: options.pickupPlaceId,
      trustClientCoordinates: options.trustClientCoordinates,
      knownLat: options.pickupLat,
      knownLng: options.pickupLng,
      geocode: options.geocode,
      resolvePlaceId: options.resolvePlaceId,
    }),
    resolveRoutePointWithPlaceId({
      address: dropoffLabel,
      placeId: options.dropoffPlaceId,
      trustClientCoordinates: options.trustClientCoordinates,
      knownLat: options.dropoffLat,
      knownLng: options.dropoffLng,
      geocode: options.geocode,
      resolvePlaceId: options.resolvePlaceId,
    }),
  ]);

  if (!origin.point && origin.providerError) {
    return { ok: false, reason: "provider_unavailable", endpoint: "pickup" };
  }
  if (!destination.point && destination.providerError) {
    return { ok: false, reason: "provider_unavailable", endpoint: "dropoff" };
  }
  if (!origin.point) {
    return { ok: false, reason: "place_unresolved", endpoint: "pickup" };
  }
  if (!destination.point) {
    return { ok: false, reason: "place_unresolved", endpoint: "dropoff" };
  }

  const metrics = await options.fetchRouteMetrics(
    origin.point.lat,
    origin.point.lng,
    destination.point.lat,
    destination.point.lng,
  );
  if (!metrics) {
    return { ok: false, reason: "routing_unavailable", endpoint: "route" };
  }
  return { ok: true, metrics, pickup: origin.point, dropoff: destination.point };
}
