import { corsHeaders } from "../shared/google-places";
import { handleBelfastEventsRoute } from "./belfast-events-handlers";
import { handlePublicGetPricingConfig } from "./owner-pricing-handlers";
import { handleQuoteCalculateRequest, handleQuoteAvailabilityRequest } from "./quote-handlers";

import { resolveTripRouteMetricsOutcome } from "../shared/route-metrics-resolver";
import { fetchRoadTripRouteMetrics } from "../../../src/lib/trip-route";

const publicLookups = new Set(["/addresses", "/geocode", "/saved-quotes/settings", "/google-reviews/summary"]);
const stores = new WeakMap();

function readOnlyStore(store) {
  if (!stores.has(store)) {
    stores.set(store, {
      get: store.get.bind(store),
      list: store.list.bind(store),
      getWithMetadata: store.getWithMetadata.bind(store),
      async put() {},
      async delete() {},
    });
  }
  return stores.get(store);
}

// Resolve a selected place via the site's public address service. The provider
// keys stay with their existing Worker and the preview still measures road mileage.
function publicRoadRoute(service, journey) {
  async function lookup(params) {
    const url = new URL("https://reimagined-octo-meme.cgr28.workers.dev/addresses");
    url.search = new URLSearchParams({ airport: "A2A", ...params }).toString();
    const result = await service.fetch(new Request(url, { headers: { Accept: "application/json" } }));
    return result.ok ? result.json() : null;
  }
  async function coordinates(id) {
    const place = await lookup({ id });
    if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)) return null;
    return { lat: place.lat, lng: place.lng };
  }
  return resolveTripRouteMetricsOutcome({
    ...journey,
    trustClientCoordinates: false,
    resolvePlaceId: async id => ({ point: await coordinates(id) }),
    geocode: async address => {
      const matches = await lookup({ q: address });
      const id = matches?.suggestions?.[0]?.id;
      return id ? coordinates(id) : null;
    },
    fetchRouteMetrics: fetchRoadTripRouteMetrics,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const pricingEnv = { TRACKING_STORE: readOnlyStore(env.PRICING), EVENTS_HUB_PUBLIC: "1" };
    if (request.method === "GET") {
      if (url.pathname === "/events/public") return handleBelfastEventsRoute(request, pricingEnv, origin);
      if (url.pathname === "/pricing/public") return handlePublicGetPricingConfig(pricingEnv, origin);
      if (publicLookups.has(url.pathname)) {
        const publicUrl = "https://reimagined-octo-meme.cgr28.workers.dev" + url.pathname + url.search;
        return env.PUBLIC_SITE.fetch(new Request(publicUrl, { headers: { Accept: "application/json", ...(origin && { Origin: origin }) } }));
      }
    }
    if (request.method === "POST") {
      if (url.pathname === "/quote/calculate") return handleQuoteCalculateRequest(request, origin, pricingEnv, trip => publicRoadRoute(env.PUBLIC_SITE, trip));
      if (url.pathname === "/quote/availability") return handleQuoteAvailabilityRequest(request, origin, pricingEnv);
    }
    return Response.json({ message: "This preview supports public fare enquiries only." }, { status: 404, headers: corsHeaders(origin) });
  },
};
