/**
 * POST /quote/calculate — server-authoritative website fare.
 * Uses the SAME pricing engine as the public quote tool (no second algorithm).
 */

import { corsHeaders } from "../shared/google-places";
import { calculateAuthoritativeWebsiteQuote } from "../../../src/lib/quote-service";
import type { QuoteServiceAirportCode } from "../../../src/lib/quote-service";
import { fetchTripRouteMetrics } from "../../../src/lib/trip-route";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export async function handleQuoteCalculateRequest(
  request: Request,
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const airportRaw = String(body.airportCode ?? "").trim().toUpperCase();
  const airportCode =
    airportRaw === "BFS" || airportRaw === "BHD" || airportRaw === "DUB"
      ? (airportRaw as QuoteServiceAirportCode)
      : null;

  const pickupLat = Number(body.pickupLat);
  const pickupLng = Number(body.pickupLng);
  const dropoffLat = Number(body.dropoffLat);
  const dropoffLng = Number(body.dropoffLng);

  let routeMetrics = null;
  if (
    Number.isFinite(pickupLat) &&
    Number.isFinite(pickupLng) &&
    Number.isFinite(dropoffLat) &&
    Number.isFinite(dropoffLng)
  ) {
    routeMetrics = await fetchTripRouteMetrics(pickupLat, pickupLng, dropoffLat, dropoffLng);
  }

  const result = calculateAuthoritativeWebsiteQuote({
    airportCode,
    fromAirport: body.fromAirport === true,
    pickupAddress: String(body.pickupAddress ?? ""),
    dropoffAddress: String(body.dropoffAddress ?? ""),
    returnJourney: body.returnJourney === true,
    outboundDate: String(body.outboundDate ?? ""),
    outboundTime: String(body.outboundTime ?? ""),
    returnDate: String(body.returnDate ?? "") || undefined,
    returnTime: String(body.returnTime ?? "") || undefined,
    passengers: Number(body.passengers),
    suitcases: Number(body.suitcases),
    routeMetrics,
  });

  console.log(
    JSON.stringify({
      event: "quote_calculate",
      ok: result.ok,
      reason: result.ok ? undefined : result.reason,
      airportCode,
      returnJourney: body.returnJourney === true,
      amount: result.ok ? result.amount : undefined,
    }),
  );

  return json(result, result.ok ? 200 : 422, origin);
}
