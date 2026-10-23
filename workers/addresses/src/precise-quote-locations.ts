import { resolveGooglePlaceDetails, type ResolvedGooglePlace } from "../shared/google-places";
import { isPreciseQuotePlace } from "../shared/precise-quote-place";
import { SERVED_AIRPORTS, servedAirportFromPlaceId } from "../shared/served-airports";
import { normaliseJourneyAddressLabel } from "../shared/journey-address-label";
import { fetchRoadTripRouteMetrics } from "../../../src/lib/trip-route";
import type { RouteResolveOutcome } from "../shared/route-metrics-resolver";

const normalise = (text: string) => normaliseJourneyAddressLabel(text).trim().toLowerCase().replace(/\s+/g, " ");
const cache = new Map<string, { at: number; place: ResolvedGooglePlace }>();
const inflight = new Map<string, Promise<ResolvedGooglePlace | null>>();

async function details(apiKey: string, id: string): Promise<ResolvedGooglePlace | null> {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.place;
  if (inflight.has(id)) return inflight.get(id)!;
  const task = resolveGooglePlaceDetails(apiKey, id, "A2A").then(place => {
    if (place && isPreciseQuotePlace(place)) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(id, { at: Date.now(), place });
      return place;
    }
    return null;
  }).finally(() => inflight.delete(id));
  inflight.set(id, task);
  return task;
}

export async function resolvePreciseQuoteLocation(input: {
  address: string; placeId?: string | null; googlePlacesApiKey?: string;
}) {
  const id = input.placeId?.trim();
  const label = normalise(input.address);
  // Only exact catalogue identifiers/labels qualify; "hotel near BFS" does not.
  const airport = id ? servedAirportFromPlaceId(id) : SERVED_AIRPORTS.find(item =>
    [item.formattedAddress, item.name, item.label].some(value => normalise(value) === label));
  if (airport) {
    if (![airport.formattedAddress, airport.name, airport.label].some(value => normalise(value) === label)) return null;
    return { lat: airport.lat, lng: airport.lng, placeId: airport.placeId, airportCode: airport.code };
  }
  if (!id || id.startsWith("ga:") || id.startsWith("ideal:")) return null;
  if (!input.googlePlacesApiKey?.trim()) throw new Error("Google Places is not configured");
  const place = await details(input.googlePlacesApiKey, id);
  if (!place || ![place.formattedAddress, place.displayAddress].some(value => normalise(value) === label)) return null;
  return { lat: place.lat!, lng: place.lng!, placeId: place.placeId, airportCode: null };
}

export async function resolvePreciseQuoteRoute(input: {
  pickupAddress: string; dropoffAddress: string;
  pickupPlaceId?: string | null; dropoffPlaceId?: string | null;
  googlePlacesApiKey?: string;
}): Promise<RouteResolveOutcome> {
  let pickup, dropoff;
  try {
    [pickup, dropoff] = await Promise.all([
      resolvePreciseQuoteLocation({ address: input.pickupAddress, placeId: input.pickupPlaceId, googlePlacesApiKey: input.googlePlacesApiKey }),
      resolvePreciseQuoteLocation({ address: input.dropoffAddress, placeId: input.dropoffPlaceId, googlePlacesApiKey: input.googlePlacesApiKey }),
    ]);
  } catch {
    return { ok: false, reason: "provider_unavailable" };
  }
  if (!pickup || !dropoff) return { ok: false, reason: "place_unresolved", endpoint: !pickup ? "pickup" : "dropoff" };
  const metrics = await fetchRoadTripRouteMetrics(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  if (!metrics) return { ok: false, reason: "routing_unavailable", endpoint: "route" };
  return { ok: true, metrics, pickup, dropoff };
}
