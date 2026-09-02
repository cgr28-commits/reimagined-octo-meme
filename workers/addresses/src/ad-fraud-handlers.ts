/**
 * Ad Fraud monitoring HTTP handlers — ingest (public, rate-limited) + owner admin APIs.
 */

import {
  anonymisedVisitorLabel,
  isAdFraudReviewStatus,
  isAdFraudRiskLevel,
  validateAdFraudIngestPayload,
} from "../shared/ad-fraud";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  adFraudStoreConfigured,
  buildAdFraudDashboard,
  getAdFraudVisitor,
  pruneAdFraudVisitorEvents,
  recordAdFraudEvent,
  updateAdFraudVisitorReview,
  type AdFraudStoreEnv,
} from "./ad-fraud-store";

export type AdFraudEnv = DriverAuthEnv & AdFraudStoreEnv;

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function trustedClientIp(request: Request): string | undefined {
  // Cloudflare Worker: CF-Connecting-IP is set by the edge.
  const cfIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cfIp) return cfIp;
  return undefined;
}

export function isAdFraudIngestPath(pathname: string): boolean {
  return pathname === "/ad-fraud/events" || pathname === "/api/ad-fraud/events";
}

export function isAdFraudAdminSummaryPath(pathname: string): boolean {
  return pathname === "/admin/ad-fraud" || pathname === "/api/admin/ad-fraud";
}

export function isAdFraudAdminVisitorPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin/ad-fraud/visitor/") ||
    pathname.startsWith("/api/admin/ad-fraud/visitor/")
  );
}

export async function handleAdFraudIngestRequest(
  request: Request,
  env: AdFraudEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const validated = validateAdFraudIngestPayload(body);
  if (!validated.ok) {
    return jsonResponse({ error: validated.error }, 400, origin);
  }

  const result = await recordAdFraudEvent(env, {
    eventType: validated.eventType,
    sessionId: validated.sessionId,
    landingPath: validated.landingPath,
    referrerHost: validated.referrerHost,
    userAgentNorm: validated.userAgentNorm,
    attribution: validated.attribution,
    meta: validated.meta,
    clientIp: trustedClientIp(request),
    requestUserAgent: request.headers.get("User-Agent") ?? undefined,
  });

  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status, origin);
  }

  return jsonResponse({ ok: true }, 202, origin);
}

export async function handleAdFraudAdminSummaryRequest(
  request: Request,
  env: AdFraudEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }
  if (!adFraudStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Ad fraud store is not configured" }, 503, origin);
  }

  const url = new URL(request.url);
  const rangeRaw = url.searchParams.get("range") || "7";
  const rangeDays = rangeRaw === "1" || rangeRaw === "today" ? 1 : rangeRaw === "30" ? 30 : 7;
  const riskParam = url.searchParams.get("risk") || "all";
  const risk =
    riskParam === "all" ? "all" : isAdFraudRiskLevel(riskParam) ? riskParam : "all";
  const campaign = url.searchParams.get("campaign") || undefined;

  const dashboard = await buildAdFraudDashboard(
    env.TRACKING_STORE,
    { rangeDays, risk, campaign },
    anonymisedVisitorLabel,
  );

  return jsonResponse(
    {
      ok: true,
      disclaimer:
        "These indicators highlight suspicious advertising traffic patterns. They are not proof that a visitor is a competitor.",
      blockingEnabled: false,
      ...dashboard,
    },
    200,
    origin,
  );
}

function visitorHashFromPath(pathname: string): string {
  const parts = pathname.split("/");
  return (parts[parts.length - 1] || "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
}

export async function handleAdFraudAdminVisitorRequest(
  request: Request,
  env: AdFraudEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }
  if (!adFraudStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Ad fraud store is not configured" }, 503, origin);
  }

  const url = new URL(request.url);
  const visitorHash = visitorHashFromPath(url.pathname);
  if (!visitorHash || visitorHash.length < 8) {
    return jsonResponse({ error: "Invalid visitor id" }, 400, origin);
  }

  if (request.method === "GET") {
    const visitor = await getAdFraudVisitor(env.TRACKING_STORE, visitorHash);
    if (!visitor) {
      return jsonResponse({ error: "Visitor not found" }, 404, origin);
    }
    // Never expose raw IP — ipHash only if present on events.
    return jsonResponse(
      {
        ok: true,
        disclaimer:
          "Indicators only — not proof of competitor activity. No automatic blocking is applied.",
        visitor: {
          ...visitor,
          anonymisedId: anonymisedVisitorLabel(visitor.visitorHash),
          events: visitor.events.map((event) => ({
            ...event,
            // Ensure admin timeline never includes a raw IP field.
            ip: undefined,
          })),
        },
      },
      200,
      origin,
    );
  }

  if (request.method === "PATCH" || request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }
    const record = body as { reviewStatus?: unknown; notes?: unknown };
    if (!isAdFraudReviewStatus(record.reviewStatus)) {
      return jsonResponse({ error: "Invalid review status" }, 400, origin);
    }
    const notes =
      typeof record.notes === "string" ? record.notes.trim().slice(0, 500) : undefined;
    const updated = await updateAdFraudVisitorReview(env.TRACKING_STORE, visitorHash, {
      reviewStatus: record.reviewStatus,
      notes,
    });
    if (!updated) {
      return jsonResponse({ error: "Visitor not found" }, 404, origin);
    }
    return jsonResponse(
      {
        ok: true,
        visitor: {
          ...updated,
          anonymisedId: anonymisedVisitorLabel(updated.visitorHash),
        },
      },
      200,
      origin,
    );
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
}

export async function runAdFraudRetentionCleanup(env: AdFraudEnv): Promise<void> {
  if (!adFraudStoreConfigured(env.TRACKING_STORE)) return;
  const result = await pruneAdFraudVisitorEvents(env.TRACKING_STORE, 3);
  if (result.visitorsTouched > 0) {
    console.log("Ad fraud retention prune", JSON.stringify(result));
  }
}
