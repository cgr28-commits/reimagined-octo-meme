/**
 * Next.js / browser wrapper around the shared route-metrics resolver.
 * Uses the same geocode fallback as TripMap (`geocodePickupAddress`).
 */

import { geocodePickupAddress } from "@/lib/google-maps";
import { fetchTripRouteMetrics, type TripRouteMetrics } from "@/lib/trip-route";
import {
  resolveRoutePoint as resolveRoutePointShared,
  resolveTripRouteMetricsForAddresses as resolveTripRouteMetricsShared,
  type RoutePoint,
} from "../../shared/route-metrics-resolver";

export type { RoutePoint };

export async function resolveRoutePoint(
  address: string,
  knownLat?: number | null,
  knownLng?: number | null,
): Promise<RoutePoint | null> {
  return resolveRoutePointShared(address, knownLat, knownLng, geocodePickupAddress);
}

export async function resolveTripRouteMetricsForAddresses(
  origin: { address: string; lat?: number | null; lng?: number | null },
  destination: { address: string; lat?: number | null; lng?: number | null },
): Promise<TripRouteMetrics | null> {
  return resolveTripRouteMetricsShared(origin, destination, {
    geocode: geocodePickupAddress,
    fetchRouteMetrics: fetchTripRouteMetrics,
  });
}
