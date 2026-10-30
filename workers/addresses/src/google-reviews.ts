/**
 * Live Google rating + review count for the website badge.
 * Refreshed about once a day from the Places API (New) using the Worker's Places key,
 * cached in KV and served at GET /google-reviews/summary.
 */
import { corsHeaders } from "../shared/google-places";

const SUMMARY_KEY = "google-reviews:summary";
const REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;
const BUSINESS_QUERY = "My Airport Taxi NI";
const NAME_MATCH = /my\s*airport\s*taxi/i;

export type GoogleReviewSummary = {
  placeId: string;
  rating: number;
  count: number;
  updatedAt: string;
};

export type GoogleReviewsEnv = { TRACKING_STORE?: KVNamespace; GOOGLE_PLACES_API_KEY?: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function valid(rating: unknown, count: unknown): boolean {
  return typeof rating === "number" && rating >= 1 && rating <= 5 && Number.isInteger(count) && (count as number) > 0;
}

export async function getGoogleReviewSummary(store: KVNamespace): Promise<GoogleReviewSummary | null> {
  return store.get<GoogleReviewSummary>(SUMMARY_KEY, "json");
}

/** Fetch the latest numbers from Google and cache them. Returns null if Google gave nothing usable. */
export async function refreshGoogleReviewSummary(
  env: GoogleReviewsEnv,
  fetchImpl: FetchLike = fetch,
  options: { force?: boolean; now?: number } = {},
): Promise<GoogleReviewSummary | null> {
  const store = env.TRACKING_STORE;
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!store || !key) return null;
  const now = options.now ?? Date.now();
  const existing = await getGoogleReviewSummary(store);
  if (!options.force && existing && now - Date.parse(existing.updatedAt) < REFRESH_AFTER_MS) return existing;

  let placeId = existing?.placeId ?? "";
  let rating: unknown;
  let count: unknown;
  if (placeId) {
    const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,rating,userRatingCount" },
    });
    if (res.ok) {
      const place = (await res.json()) as { rating?: number; userRatingCount?: number };
      rating = place.rating;
      count = place.userRatingCount;
    }
  }
  if (!valid(rating, count)) {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: BUSINESS_QUERY, regionCode: "GB" }),
    });
    if (!res.ok) return existing;
    const data = (await res.json()) as {
      places?: Array<{ id?: string; displayName?: { text?: string }; rating?: number; userRatingCount?: number }>;
    };
    const match = (data.places ?? []).find((p) => NAME_MATCH.test(p.displayName?.text ?? ""));
    if (!match?.id) return existing;
    placeId = match.id;
    rating = match.rating;
    count = match.userRatingCount;
  }
  if (!valid(rating, count)) return existing;
  const summary: GoogleReviewSummary = {
    placeId,
    rating: Math.round((rating as number) * 10) / 10,
    count: count as number,
    updatedAt: new Date(now).toISOString(),
  };
  await store.put(SUMMARY_KEY, JSON.stringify(summary));
  return summary;
}

export async function handleGoogleReviewSummary(
  env: GoogleReviewsEnv,
  origin: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  const store = env.TRACKING_STORE;
  let summary = store ? await getGoogleReviewSummary(store) : null;
  if (!summary) summary = await refreshGoogleReviewSummary(env, fetchImpl).catch(() => null);
  const body = summary ? { rating: summary.rating, count: summary.count, updatedAt: summary.updatedAt } : { error: "unavailable" };
  return new Response(JSON.stringify(body), {
    status: summary ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      ...corsHeaders(origin),
    },
  });
}
