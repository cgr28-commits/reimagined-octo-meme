import worker from "./index";
export * from "./index";

const publicGets = new Set(["/events/public", "/pricing/public", "/addresses", "/geocode", "/saved-quotes/settings", "/google-reviews/summary"]);
const quotePosts = new Set(["/quote/calculate", "/quote/availability"]);
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
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (!(publicGets.has(path) && (method === "GET" || method === "OPTIONS")) &&
        !(quotePosts.has(path) && (method === "POST" || method === "OPTIONS"))) {
      return new Response("This preview supports public fare enquiries only.", { status: 404 });
    }
    return worker.fetch(request, {
      TRACKING_STORE: readOnlyStore(env.TRACKING_STORE),
      EVENTS_HUB_PUBLIC: "1",
      GOOGLE_PLACES_API_KEY: env.GOOGLE_PLACES_API_KEY,
      GETADDRESS_API_KEY: env.GETADDRESS_API_KEY,
      IDEAL_POSTCODES_API_KEY: env.IDEAL_POSTCODES_API_KEY,
      QUOTE_RECEIPT_SECRET: env.QUOTE_RECEIPT_SECRET,
    });
  },
};
