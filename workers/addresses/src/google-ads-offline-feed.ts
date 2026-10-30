/**
 * Google Ads scheduled upload file (HTTPS, username + password).
 *
 *   GET  /ads/paid-bookings.csv         Basic auth — read by Google Ads once a day
 *   GET  /owner/ads-feed                owner — file address, username, password, row count
 *   POST /owner/ads-feed/rotate         owner — new password (the Google Ads schedule must be updated)
 *
 * Credentials live in KV (generated on first owner view), so no GitHub/Cloudflare secret is needed.
 */
import { corsHeaders } from "../shared/google-places";
import {
  OFFLINE_FEED_CONVERSION_NAME,
  OFFLINE_FEED_LOOKBACK_DAYS,
  buildOfflineFeedCsv,
  offlineFeedRows,
  parseBasicAuth,
  safeEqual,
} from "../shared/google-ads-offline-feed";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { listRecentPaidBookings } from "./paid-booking-store";

type Env = DriverAuthEnv & { TRACKING_STORE?: KVNamespace };

const CREDENTIALS_KEY = "ads-feed:credentials";
const FEED_PATH = "/ads/paid-bookings.csv";
const FEED_USERNAME = "googleads";

type FeedCredentials = { username: string; password: string; createdAt: string };

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function readCredentials(store: KVNamespace): Promise<FeedCredentials | null> {
  const value = await store.get<FeedCredentials>(CREDENTIALS_KEY, "json");
  return value?.username && value?.password ? value : null;
}

async function createCredentials(store: KVNamespace): Promise<FeedCredentials> {
  const next: FeedCredentials = {
    username: FEED_USERNAME,
    password: randomPassword(),
    createdAt: new Date().toISOString(),
  };
  await store.put(CREDENTIALS_KEY, JSON.stringify(next));
  return next;
}

async function buildFeed(store: KVNamespace): Promise<{ csv: string; rows: number }> {
  const records = await listRecentPaidBookings(store, { days: OFFLINE_FEED_LOOKBACK_DAYS, limit: 200 });
  return buildOfflineFeedCsv(records);
}

export async function handleAdsOfflineFeed(request: Request, env: Env): Promise<Response> {
  const unauthorized = () =>
    new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Google Ads conversions"', "Cache-Control": "no-store" },
    });
  if (!env.TRACKING_STORE) return new Response("Unavailable", { status: 503 });
  const credentials = await readCredentials(env.TRACKING_STORE);
  const presented = parseBasicAuth(request.headers.get("Authorization"));
  if (
    !credentials ||
    !presented ||
    !safeEqual(presented.username, credentials.username) ||
    !safeEqual(presented.password, credentials.password)
  ) {
    return unauthorized();
  }
  const { csv } = await buildFeed(env.TRACKING_STORE);
  await env.TRACKING_STORE.put("ads-feed:last-fetched", new Date().toISOString());
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="paid-bookings.csv"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function handleOwnerAdsFeed(
  request: Request,
  env: Env,
  origin: string | null,
  rotate: boolean,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Unauthorized" }, 401, origin);
  if (!env.TRACKING_STORE) return json({ error: "Booking store unavailable" }, 503, origin);
  const store = env.TRACKING_STORE;
  const credentials = rotate ? await createCredentials(store) : (await readCredentials(store)) ?? (await createCredentials(store));
  const records = await listRecentPaidBookings(store, { days: OFFLINE_FEED_LOOKBACK_DAYS, limit: 200 });
  // Owner list: booking reference, time and fare only — click IDs never leave the file.
  const bookings = offlineFeedRows(records)
    .map((row) => ({ paymentReference: row.orderId, paidAt: row.conversionTime, value: row.value, currency: row.currency }))
    .reverse();
  const rows = bookings.length;
  const lastFetchedAt = await store.get("ads-feed:last-fetched");
  return json(
    {
      url: `${new URL(request.url).origin}${FEED_PATH}`,
      username: credentials.username,
      password: credentials.password,
      conversionName: OFFLINE_FEED_CONVERSION_NAME,
      lookbackDays: OFFLINE_FEED_LOOKBACK_DAYS,
      rows,
      bookings,
      lastFetchedAt: lastFetchedAt || null,
    },
    200,
    origin,
  );
}
