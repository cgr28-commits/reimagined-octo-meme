/**
 * Live Google rating + review count for the website badge.
 * Refreshed about once a day from the Places API (New) using the Worker's Places key,
 * cached in KV and served at GET /google-reviews/summary.
 */
import { corsHeaders } from "../shared/google-places";

const SUMMARY_KEY = "google-reviews:summary";
const ERROR_KEY = "google-reviews:last-error";

async function noteError(store: KVNamespace, reason: string): Promise<void> {
  await store.put(ERROR_KEY, JSON.stringify({ reason: reason.slice(0, 300), at: new Date().toISOString() }), {
    expirationTtl: 60 * 60 * 24 * 7,
  });
}

async function googleError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
  return `HTTP ${res.status} ${body?.error?.status ?? ""} ${body?.error?.message ?? ""}`.trim();
}
const REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;
const BUSINESS_QUERIES = ["My Airport Taxi NI", "My Airport Taxi NI Newtownabbey", "myairporttaxini.co.uk"];
const NAME_MATCH = /my\s*airport\s*taxi/i;
const WEBSITE_MATCH = /myairporttaxini\.co\.uk/i;
/** Business landline and WhatsApp mobile, digits only, national format. */
const PHONE_DIGITS = ["07549815538", "02896022952"];

type PlaceHit = {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
};

/** Ours if the website or phone number matches (names on Google can differ from the trading name). */
export function isOurPlace(p: PlaceHit): boolean {
  if (WEBSITE_MATCH.test(p.websiteUri ?? "")) return true;
  const phone = (p.nationalPhoneNumber ?? "").replace(/\D/g, "");
  if (phone && PHONE_DIGITS.includes(phone)) return true;
  return NAME_MATCH.test(p.displayName?.text ?? "");
}

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
    let match: PlaceHit | undefined;
    const seen: string[] = [];
    for (const query of BUSINESS_QUERIES) {
      const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber",
        },
        body: JSON.stringify({ textQuery: query, regionCode: "GB" }),
      });
      if (!res.ok) {
        await noteError(store, `searchText: ${await googleError(res)}`);
        return existing;
      }
      const data = (await res.json()) as { places?: PlaceHit[] };
      for (const p of data.places ?? []) seen.push(`${p.displayName?.text ?? "?"} (${p.websiteUri ?? "no site"})`);
      match = (data.places ?? []).find(isOurPlace);
      if (match) break;
    }
    if (!match?.id) {
      await noteError(store, `no match among: ${seen.slice(0, 6).join("; ") || "(none)"}`);
      return existing;
    }
    placeId = match.id;
    rating = match.rating;
    count = match.userRatingCount;
  }
  if (!valid(rating, count)) {
    await noteError(store, `invalid numbers: rating=${String(rating)} count=${String(count)}`);
    return existing;
  }
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
  const lastError = !summary && store ? await store.get<{ reason: string }>(ERROR_KEY, "json") : null;
  const body = summary
    ? { rating: summary.rating, count: summary.count, updatedAt: summary.updatedAt }
    : { error: "unavailable", reason: lastError?.reason ?? (env.GOOGLE_PLACES_API_KEY ? "no data yet" : "no Places key") };
  return new Response(JSON.stringify(body), {
    status: summary ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": summary ? "public, max-age=3600" : "no-store",
      ...corsHeaders(origin),
    },
  });
}
