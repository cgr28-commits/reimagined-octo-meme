/** Live Google review count: refresh from Places API (New), cache daily, never show junk. */
import assert from "node:assert/strict";
import {
  getGoogleReviewSummary,
  handleGoogleReviewSummary,
  refreshGoogleReviewSummary,
} from "../workers/addresses/src/google-reviews";

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = kv.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
  } as unknown as KVNamespace;
}

async function main() {
  const store = memoryStore();
  const calls: string[] = [];
  let count = 16;
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push(url);
    assert.equal((init?.headers as Record<string, string>)["X-Goog-Api-Key"], "k");
    if (url.endsWith(":searchText")) {
      return new Response(JSON.stringify({ places: [
        { id: "other", displayName: { text: "Another Taxi Co" }, rating: 3.1, userRatingCount: 400 },
        { id: "mat-place", displayName: { text: "My Airport Taxi NI" }, rating: 5, userRatingCount: count },
      ] }), { status: 200 });
    }
    if (url.includes("/places/mat-place")) {
      return new Response(JSON.stringify({ rating: 5, userRatingCount: count }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const env = { TRACKING_STORE: store, GOOGLE_PLACES_API_KEY: "k" };
  const t0 = Date.parse("2026-10-30T12:00:00Z");

  // First run finds our business by name (not the first result) and caches it.
  let s = await refreshGoogleReviewSummary(env, fakeFetch, { now: t0 });
  assert.equal(s?.placeId, "mat-place");
  assert.equal(s?.count, 16);
  assert.equal(s?.rating, 5);

  // Within 20 hours: no Google call.
  calls.length = 0;
  count = 17;
  s = await refreshGoogleReviewSummary(env, fakeFetch, { now: t0 + 2 * 3600_000 });
  assert.equal(calls.length, 0);
  assert.equal(s?.count, 16);

  // Next day: uses the saved place ID directly.
  s = await refreshGoogleReviewSummary(env, fakeFetch, { now: t0 + 21 * 3600_000 });
  assert.deepEqual(calls, ["https://places.googleapis.com/v1/places/mat-place"]);
  assert.equal(s?.count, 17);

  // Bad data from Google never replaces good numbers.
  const badFetch = async () => new Response(JSON.stringify({ rating: 0, userRatingCount: 0, places: [] }), { status: 200 });
  s = await refreshGoogleReviewSummary(env, badFetch, { now: t0 + 48 * 3600_000 });
  assert.equal(s?.count, 17);
  assert.equal((await getGoogleReviewSummary(store))?.count, 17);

  // Endpoint serves the cached numbers.
  const res = await handleGoogleReviewSummary(env, null, fakeFetch);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(await res.json()).sort(), ["count", "rating", "updatedAt"]);

  // No key, no store: nothing breaks.
  assert.equal(await refreshGoogleReviewSummary({}, fakeFetch), null);
  console.log("check-google-review-count: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
