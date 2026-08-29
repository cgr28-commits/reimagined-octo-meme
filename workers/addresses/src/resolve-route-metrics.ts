/**
 * Cloudflare Worker helper: resolve driving-route metrics the same way the
 * public site / Personal Quotes do (catalogue → place ID → geocode → OSRM).
 *
 * Commercial pricing uses road routing (OSRM) only — never haversine×1.48.
 * Payment must pass place IDs and must NOT trust browser lat/lng.
 */

import { geocodeAddress, resolveGooglePlaceLocation } from "../shared/google-places";
import {
  isGetAddressPlaceId,
  resolveGetAddressDetails,
} from "../shared/getaddress";
import {
  isIdealPostcodesPlaceId,
  resolveIdealPostcodesDetails,
} from "../shared/ideal-postcodes";
import {
  resolveTripRouteMetricsForAddresses,
  resolveTripRouteMetricsOutcome,
  type RouteResolveOutcome,
  type TripRouteMetricsLike,
} from "../shared/route-metrics-resolver";
import { fetchRoadTripRouteMetrics } from "../../../src/lib/trip-route";

export type WorkerRouteMetricsEnv = {
  googlePlacesApiKey?: string;
  getAddressApiKey?: string;
};

function buildPlaceIdResolver(env: WorkerRouteMetricsEnv) {
  const googleKey = env.googlePlacesApiKey?.trim() ?? "";
  const getAddressKey = env.getAddressApiKey?.trim() ?? "";

  return async (placeId: string, addressHint?: string) => {
    const id = placeId.trim();
    if (!id) {
      return { point: null as { lat: number; lng: number } | null };
    }

    // Ideal Postcodes: coords often embedded; A2A filter accepts NI + ROI.
    if (isIdealPostcodesPlaceId(id)) {
      try {
        const details = await resolveIdealPostcodesDetails(id, "A2A");
        if (
          details &&
          typeof details.lat === "number" &&
          typeof details.lng === "number" &&
          Number.isFinite(details.lat) &&
          Number.isFinite(details.lng)
        ) {
          return { point: { lat: details.lat, lng: details.lng } };
        }
        const hint = details?.formattedAddress || addressHint;
        if (hint && googleKey) {
          const coords = await geocodeAddress(googleKey, hint);
          if (coords) return { point: coords };
        }
        return { point: null };
      } catch {
        return { point: null, providerError: true };
      }
    }

    // GetAddress (legacy place IDs) — resolve with server key when present.
    if (isGetAddressPlaceId(id)) {
      if (!getAddressKey) {
        const hint = addressHint?.trim();
        if (hint && googleKey) {
          try {
            const coords = await geocodeAddress(googleKey, hint);
            if (coords) return { point: coords };
          } catch {
            return { point: null, providerError: true };
          }
        }
        return { point: null };
      }
      try {
        const details = await resolveGetAddressDetails(getAddressKey, id, "A2A");
        if (
          details &&
          typeof details.lat === "number" &&
          typeof details.lng === "number" &&
          Number.isFinite(details.lat) &&
          Number.isFinite(details.lng)
        ) {
          return { point: { lat: details.lat, lng: details.lng } };
        }
        const hint = details?.formattedAddress || addressHint;
        if (hint && googleKey) {
          const coords = await geocodeAddress(googleKey, hint);
          if (coords) return { point: coords };
        }
        return { point: null };
      } catch {
        return { point: null, providerError: true };
      }
    }

    // Google Place ID (ChIJ… / Places API resource name).
    if (!googleKey) {
      return { point: null, providerError: true };
    }
    const google = await resolveGooglePlaceLocation(googleKey, id);
    if (google.ok) {
      return { point: { lat: google.lat, lng: google.lng } };
    }
    if (google.reason === "provider_error") {
      return { point: null, providerError: true };
    }
    return { point: null };
  };
}

/**
 * Quote / saved-quote path: may use known client coords when present.
 * Prefer place IDs when supplied.
 */
export async function resolveWorkerTripRouteMetrics(options: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  googlePlacesApiKey?: string;
  getAddressApiKey?: string;
  /** Default true for backwards-compatible quote handlers. */
  trustClientCoordinates?: boolean;
}): Promise<TripRouteMetricsLike | null> {
  const apiKey = options.googlePlacesApiKey?.trim() ?? "";
  const geocode = async (address: string) => {
    if (!apiKey) return null;
    return geocodeAddress(apiKey, address);
  };
  const resolvePlaceId = buildPlaceIdResolver({
    googlePlacesApiKey: options.googlePlacesApiKey,
    getAddressApiKey: options.getAddressApiKey,
  });
  const trustClient = options.trustClientCoordinates !== false;

  const outcome = await resolveTripRouteMetricsOutcome({
    pickupAddress: options.pickupAddress,
    dropoffAddress: options.dropoffAddress,
    pickupPlaceId: options.pickupPlaceId,
    dropoffPlaceId: options.dropoffPlaceId,
    trustClientCoordinates: trustClient,
    pickupLat: options.pickupLat,
    pickupLng: options.pickupLng,
    dropoffLat: options.dropoffLat,
    dropoffLng: options.dropoffLng,
    geocode,
    resolvePlaceId,
    fetchRouteMetrics: fetchRoadTripRouteMetrics,
  });

  if (outcome.ok) return outcome.metrics;

  // Legacy callers that only pass addresses (no place IDs) keep the old path
  // when the outcome-aware resolve failed solely because coords were absent —
  // still never invents metrics.
  if (
    !options.pickupPlaceId &&
    !options.dropoffPlaceId &&
    trustClient
  ) {
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
        fetchRouteMetrics: fetchRoadTripRouteMetrics,
      },
    );
  }

  return null;
}

/**
 * SumUp payment path: never trust client lat/lng; require place IDs when available;
 * return a typed failure so the customer is not told to reselect on OSRM/Google blips.
 */
export async function resolveWorkerTripRouteMetricsForPayment(options: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  googlePlacesApiKey?: string;
  getAddressApiKey?: string;
}): Promise<RouteResolveOutcome> {
  const apiKey = options.googlePlacesApiKey?.trim() ?? "";
  const geocode = async (address: string) => {
    if (!apiKey) return null;
    try {
      return await geocodeAddress(apiKey, address);
    } catch {
      return null;
    }
  };

  return resolveTripRouteMetricsOutcome({
    pickupAddress: options.pickupAddress,
    dropoffAddress: options.dropoffAddress,
    pickupPlaceId: options.pickupPlaceId,
    dropoffPlaceId: options.dropoffPlaceId,
    trustClientCoordinates: false,
    geocode,
    resolvePlaceId: buildPlaceIdResolver({
      googlePlacesApiKey: options.googlePlacesApiKey,
      getAddressApiKey: options.getAddressApiKey,
    }),
    fetchRouteMetrics: fetchRoadTripRouteMetrics,
  });
}
