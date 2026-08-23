/**
 * POST /quote/calculate — server-authoritative website fare.
 * Uses the SAME pricing engine as the public quote tool (no second algorithm).
 *
 * Owner/Driver Quick Quote may pass X-Owner-Key to:
 * - raise the passenger ceiling to 7 (Minibus)
 * - force Minibus via vehicleChoice / vehicleType using existing multipliers
 */

import { corsHeaders } from "../shared/google-places";
import {
  parseQuickQuoteVehicleChoice,
  quickQuoteMaxPassengersForVehicle,
  type QuickQuoteVehicleChoice,
} from "../shared/quick-quote";
import { calculateAuthoritativeWebsiteQuote } from "../../../src/lib/quote-service";
import type { QuoteServiceAirportCode } from "../../../src/lib/quote-service";
import {
  MINIBUS_VEHICLE,
  selectVehicleForParty,
} from "../../../src/lib/vehicle-selection";
import type { VehicleType } from "../../../src/lib/data";
import { ownerAuthorized } from "./driver-auth";
import { resolveWorkerTripRouteMetrics } from "./resolve-route-metrics";
import { parseClientRouteMetrics } from "./parse-route-metrics";
import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";
import { drivingMilesFromKm } from "../../../src/lib/quote";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function resolveVehicleType(
  body: Record<string, unknown>,
  passengers: number,
  suitcases: number,
  ownerMode: boolean,
): { vehicleType: VehicleType; vehicleChoice: QuickQuoteVehicleChoice; maxPassengers: number } {
  const choice = parseQuickQuoteVehicleChoice(
    body.vehicleChoice ?? body.vehiclePreference ?? body.vehicleType,
  );
  if (ownerMode && choice === "Minibus") {
    return {
      vehicleType: MINIBUS_VEHICLE,
      vehicleChoice: "Minibus",
      maxPassengers: quickQuoteMaxPassengersForVehicle("Minibus"),
    };
  }
  // Saloon choice (or unauthenticated): still allow Estate/Minibus via party rules.
  return {
    vehicleType: selectVehicleForParty(passengers, Math.max(0, suitcases)),
    vehicleChoice: "Saloon",
    maxPassengers: ownerMode
      ? quickQuoteMaxPassengersForVehicle("Saloon")
      : quickQuoteMaxPassengersForVehicle("Saloon"),
  };
}

export async function handleQuoteCalculateRequest(
  request: Request,
  origin: string | null,
  env?: {
    OWNER_ACCESS_KEY?: string;
    DRIVER_ACCESS_KEY?: string;
    GOOGLE_PLACES_API_KEY?: string;
  },
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

  const pickupLat = Number(body.pickupLat);
  const pickupLng = Number(body.pickupLng);
  const dropoffLat = Number(body.dropoffLat);
  const dropoffLng = Number(body.dropoffLng);

  const pickupAddress = String(body.pickupAddress ?? "");
  const dropoffAddress = String(body.dropoffAddress ?? "");

  // Infer BFS/BHD/DUB when the UI omitted airportCode (common when the airport
  // was chosen from address suggestions rather than the Quick Quote chip).
  // Missing airportCode previously forced point-to-point and skipped the BFS floor.
  const inferred = resolveAirportTransferIntent({
    airportCode: body.airportCode == null ? null : String(body.airportCode),
    fromAirport: typeof body.fromAirport === "boolean" ? body.fromAirport : null,
    pickupAddress,
    dropoffAddress,
  });
  const airportCode = (inferred?.airportCode ?? null) as QuoteServiceAirportCode | null;
  const fromAirport = inferred?.fromAirport ?? body.fromAirport === true;
  const airportCodeSource =
    String(body.airportCode ?? "").trim() &&
    ["BFS", "BHD", "DUB", "LDY"].includes(String(body.airportCode).trim().toUpperCase())
      ? "client"
      : inferred
        ? "inferred"
        : "none";

  // Worker resolve first (geocode + OSRM/haversine). Client metrics are fallback only —
  // short/wrong browser metrics previously overrode a correct Worker resolve and
  // produced £55 instead of the BFS floor £65.
  let routeMetricsSource: "worker" | "client" | "none" = "none";
  let routeMetrics = await resolveWorkerTripRouteMetrics({
    pickupAddress,
    dropoffAddress,
    pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
    pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
    dropoffLat: Number.isFinite(dropoffLat) ? dropoffLat : null,
    dropoffLng: Number.isFinite(dropoffLng) ? dropoffLng : null,
    googlePlacesApiKey: env?.GOOGLE_PLACES_API_KEY,
  });
  if (routeMetrics) {
    routeMetricsSource = "worker";
  } else {
    routeMetrics = parseClientRouteMetrics(body.routeMetrics);
    if (routeMetrics) {
      routeMetricsSource = "client";
    }
  }

  if (!routeMetrics) {
    return json(
      {
        ok: false,
        reason: "no_fare",
        message:
          "We could not measure that route confidently. Confirm both addresses from suggestions and try again.",
        diagnostics: {
          pickupAddress,
          dropoffAddress,
          airportCode,
          fromAirport,
          airportCodeSource,
          routeMetricsSource,
        },
      },
      422,
      origin,
    );
  }

  // Require explicit One Way / Return — never treat a missing field as One Way.
  let returnJourney: boolean;
  if (typeof body.returnJourney === "boolean") {
    returnJourney = body.returnJourney;
  } else if (body.journeyMode === "one-way") {
    returnJourney = false;
  } else if (body.journeyMode === "return") {
    returnJourney = true;
  } else {
    return json(
      {
        ok: false,
        reason: "incomplete",
        message: "Journey mode (One Way or Return) is required.",
      },
      422,
      origin,
    );
  }

  // Require explicit passenger and suitcase selections — never default to 1 / 0.
  if (body.passengers == null || body.suitcases == null) {
    return json(
      {
        ok: false,
        reason: "incomplete",
        message: "Passenger and suitcase selections are required.",
      },
      422,
      origin,
    );
  }

  const passengers = Number(body.passengers);
  const suitcases = Number(body.suitcases);
  if (!Number.isFinite(passengers) || !Number.isInteger(passengers) || passengers < 1) {
    return json(
      {
        ok: false,
        reason: "incomplete",
        message: "Passenger count is required.",
      },
      422,
      origin,
    );
  }
  if (!Number.isFinite(suitcases) || !Number.isInteger(suitcases) || suitcases < 0) {
    return json(
      {
        ok: false,
        reason: "incomplete",
        message: "Luggage count is required.",
      },
      422,
      origin,
    );
  }

  const ownerMode = Boolean(env && ownerAuthorized(request, env));
  const resolved = resolveVehicleType(
    body,
    Math.floor(passengers),
    Math.floor(suitcases),
    ownerMode,
  );

  const result = calculateAuthoritativeWebsiteQuote({
    airportCode,
    fromAirport,
    pickupAddress,
    dropoffAddress,
    returnJourney,
    outboundDate: String(body.outboundDate ?? ""),
    outboundTime: String(body.outboundTime ?? ""),
    returnDate: String(body.returnDate ?? "") || undefined,
    returnTime: String(body.returnTime ?? "") || undefined,
    passengers,
    suitcases,
    routeMetrics,
    vehicleType: resolved.vehicleType,
    maxPassengers: resolved.maxPassengers,
  });

  const miles = Math.round(drivingMilesFromKm(routeMetrics.distanceKm) * 10) / 10;
  const diagnostics = {
    pickupAddress,
    dropoffAddress,
    pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
    pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
    dropoffLat: Number.isFinite(dropoffLat) ? dropoffLat : null,
    dropoffLng: Number.isFinite(dropoffLng) ? dropoffLng : null,
    airportCode,
    fromAirport,
    airportCodeSource,
    routeMetricsSource,
    routeMiles: miles,
    routeDurationMinutes: Math.round(routeMetrics.durationMinutes * 10) / 10,
    distanceKm: Math.round(routeMetrics.distanceKm * 100) / 100,
    workerHost: "reimagined-octo-meme.cgr28.workers.dev",
  };

  console.log(
    JSON.stringify({
      event: "quote_calculate",
      ok: result.ok,
      reason: result.ok ? undefined : result.reason,
      airportCode,
      fromAirport,
      airportCodeSource,
      routeMetricsSource,
      returnJourney,
      ownerMode,
      vehicleChoice: resolved.vehicleChoice,
      amount: result.ok ? result.amount : undefined,
      miles,
    }),
  );

  if (!result.ok) {
    return json({ ...result, diagnostics }, 422, origin);
  }

  return json(
    {
      ...result,
      vehicleChoice: resolved.vehicleChoice,
      diagnostics,
    },
    200,
    origin,
  );
}
