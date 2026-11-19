import { corsHeaders } from "../shared/google-places";
import { handleBelfastEventsRoute } from "./belfast-events-handlers";
import { handlePublicGetPricingConfig } from "./owner-pricing-handlers";
import { handleQuoteCalculateRequest, handleQuoteAvailabilityRequest } from "./quote-handlers";

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
      if (url.pathname === "/quote/calculate") return handleQuoteCalculateRequest(request, origin, pricingEnv);
      if (url.pathname === "/quote/availability") return handleQuoteAvailabilityRequest(request, origin, pricingEnv);
    }
    return Response.json({ message: "This preview supports public fare enquiries only." }, { status: 404, headers: corsHeaders(origin) });
  },
};
