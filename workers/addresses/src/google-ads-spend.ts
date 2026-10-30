/**
 * Google Ads spend for the owner dashboard.
 *
 *   POST /ads/spend-report     Google Ads Script (header X-Ads-Spend-Token) → daily cost totals
 *   GET  /owner/ads-spend      owner — today / week / month spend, last report time, the script to paste
 */
import { corsHeaders } from "../shared/google-places";
import {
  adsSpendPeriods,
  buildAdsSpendScript,
  mergeAdsSpend,
  sanitizeAdsSpendReport,
  type AdsSpendDaily,
} from "../shared/google-ads-spend";
import { safeEqual } from "../shared/google-ads-offline-feed";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";

type Env = DriverAuthEnv & { TRACKING_STORE?: KVNamespace };

const TOKEN_KEY = "ads-spend:token";
const DAILY_KEY = "ads-spend:daily";
const LAST_REPORT_KEY = "ads-spend:last-report";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureToken(store: KVNamespace): Promise<string> {
  const existing = await store.get(TOKEN_KEY);
  if (existing) return existing;
  const token = randomToken();
  await store.put(TOKEN_KEY, token);
  return token;
}

export async function handleAdsSpendReport(request: Request, env: Env): Promise<Response> {
  const plain = (body: string, status: number) =>
    new Response(body, { status, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  if (!env.TRACKING_STORE) return plain("Unavailable", 503);
  const store = env.TRACKING_STORE;
  const token = await store.get(TOKEN_KEY);
  const presented = request.headers.get("X-Ads-Spend-Token")?.trim() ?? "";
  if (!token || !presented || !safeEqual(presented, token)) return plain("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  const incoming = sanitizeAdsSpendReport(body);
  const days = Object.keys(incoming).length;
  if (days === 0) return plain("No days in report", 400);
  const existing = ((await store.get<AdsSpendDaily>(DAILY_KEY, "json")) ?? {}) as AdsSpendDaily;
  await store.put(DAILY_KEY, JSON.stringify(mergeAdsSpend(existing, incoming)));
  await store.put(LAST_REPORT_KEY, new Date().toISOString());
  return plain(`OK ${days} days`, 200);
}

export async function handleOwnerAdsSpend(request: Request, env: Env, origin: string | null): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Unauthorized" }, 401, origin);
  if (!env.TRACKING_STORE) return json({ error: "Store unavailable" }, 503, origin);
  const store = env.TRACKING_STORE;
  const token = await ensureToken(store);
  const daily = ((await store.get<AdsSpendDaily>(DAILY_KEY, "json")) ?? {}) as AdsSpendDaily;
  const lastReportAt = await store.get(LAST_REPORT_KEY);
  const reportUrl = `${new URL(request.url).origin}/ads/spend-report`;
  return json(
    {
      connected: Boolean(lastReportAt),
      lastReportAt: lastReportAt || null,
      periods: adsSpendPeriods(daily),
      script: buildAdsSpendScript(reportUrl, token),
    },
    200,
    origin,
  );
}
