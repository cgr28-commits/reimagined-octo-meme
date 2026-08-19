/**
 * Owner + public handlers for Daily Quote Pricing Intelligence.
 * Analytics only — never mutates pricing-config.json.
 */

import {
  buildQuoteAnalyticsKey,
  londonDayKey,
  quoteLeadToIntelligenceEvent,
  type QuoteLeadAnalyticsExtras,
} from "../shared/pricing-intelligence";
import type { QuoteLeadDetails } from "../shared/quote-lead";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  getPricingIntelligenceDashboard,
  runDailyPricingIntelligenceReport,
  type PricingIntelJobEnv,
} from "./pricing-intelligence-job";
import {
  saveQuoteIntelligenceEvent,
  updateQuoteIntelligenceFunnel,
} from "./pricing-intelligence-store";

export type PricingIntelHandlerEnv = DriverAuthEnv &
  PricingIntelJobEnv & {
    TRACKING_STORE?: KVNamespace;
  };

export function isOwnerPricingIntelligencePath(pathname: string): boolean {
  return (
    pathname === "/owner/pricing-intelligence" ||
    pathname === "/api/owner/pricing-intelligence"
  );
}

export function isQuoteFunnelPath(pathname: string): boolean {
  return pathname === "/quote-funnel" || pathname === "/api/quote-funnel";
}

export function isPricingIntelligenceRunPath(pathname: string): boolean {
  return (
    pathname === "/owner/pricing-intelligence/run" ||
    pathname === "/api/owner/pricing-intelligence/run"
  );
}

export async function persistQuoteLeadIntelligence(
  env: PricingIntelHandlerEnv,
  details: QuoteLeadDetails,
  fingerprint: string,
  extras: QuoteLeadAnalyticsExtras = {},
): Promise<{ saved: boolean; eventId?: string }> {
  if (!env.TRACKING_STORE) return { saved: false };
  try {
    const event = quoteLeadToIntelligenceEvent(details, fingerprint, extras);
    if (!event) return { saved: false };
    await saveQuoteIntelligenceEvent(env.TRACKING_STORE, event);
    return { saved: true, eventId: event.id };
  } catch (error) {
    console.error("Pricing intelligence quote persist failed", error);
    return { saved: false };
  }
}

export async function handleQuoteFunnelRequest(
  request: Request,
  env: PricingIntelHandlerEnv,
): Promise<{ ok: boolean; updated?: boolean; error?: string; status: number }> {
  if (!env.TRACKING_STORE) {
    return { ok: false, error: "Storage is not configured", status: 503 };
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON", status: 400 };
  }

  const eventRaw = String(body.event ?? "").trim();
  const event =
    eventRaw === "book_click" || eventRaw === "checkout_started" || eventRaw === "paid"
      ? eventRaw
      : null;
  if (!event) {
    return { ok: false, error: "Invalid funnel event", status: 400 };
  }

  const fingerprint = String(body.fingerprint ?? "").trim();
  let analyticsKey = String(body.analyticsKey ?? "").trim();

  if (!analyticsKey && body.pickupLabel && body.dropoffLabel && body.estimatedPrice) {
    analyticsKey = buildQuoteAnalyticsKey({
      pickupLabel: String(body.pickupLabel),
      dropoffLabel: String(body.dropoffLabel),
      returnJourney: Boolean(body.returnJourney),
      estimatedPrice: String(body.estimatedPrice),
      vehicle: String(body.vehicle ?? ""),
      passengers: Number(body.passengers) || 1,
      suitcases: Number(body.suitcases) || 0,
    });
  }

  if (!fingerprint && !analyticsKey) {
    return { ok: false, error: "Missing fingerprint or analyticsKey", status: 400 };
  }

  const londonDay = String(body.londonDay ?? "").trim() || londonDayKey();
  const updated = await updateQuoteIntelligenceFunnel(env.TRACKING_STORE, {
    fingerprint: fingerprint || undefined,
    analyticsKey: analyticsKey || undefined,
    londonDay,
    event,
  });

  return { ok: true, updated: Boolean(updated), status: 200 };
}

export async function handleOwnerPricingIntelligenceGet(
  request: Request,
  env: PricingIntelHandlerEnv,
): Promise<{ ok: true; data: Awaited<ReturnType<typeof getPricingIntelligenceDashboard>> } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — use OWNER_ACCESS_KEY.", status: 401 };
  }
  if (!env.TRACKING_STORE) {
    return { error: "Storage is not configured", status: 503 };
  }

  const data = await getPricingIntelligenceDashboard(env);
  return { ok: true, data };
}

export async function handleOwnerPricingIntelligenceRun(
  request: Request,
  env: PricingIntelHandlerEnv,
): Promise<
  | { ok: true; dayKey: string; skipped?: boolean }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — use OWNER_ACCESS_KEY.", status: 401 };
  }
  if (!env.TRACKING_STORE) {
    return { error: "Storage is not configured", status: 503 };
  }

  let force = false;
  let skipEmail = false;
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      force = body.force === true;
      skipEmail = body.skipEmail === true;
    } catch {
      // empty body ok
    }
  }

  const result = await runDailyPricingIntelligenceReport(env, {
    force,
    skipEmail,
    enrich: true,
  });
  if (!result.ok) {
    return { error: result.error || "Report failed", status: 500 };
  }
  return { ok: true, dayKey: result.dayKey, skipped: result.skipped };
}
