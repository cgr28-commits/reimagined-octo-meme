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

  const airportRaw = String(body.airportCode ?? "").trim().toUpperCase();
  const airportCode =
    airportRaw === "BFS" || airportRaw === "BHD" || airportRaw === "DUB"
      ? (airportRaw as QuoteServiceAirportCode)
      : null;

  const pickupLat = Number(body.pickupLat);
  const pickupLng = Number(body.pickupLng);
  const dropoffLat = Number(body.dropoffLat);
  const dropoffLng = Number(body.dropoffLng);

  const pickupAddress = String(body.pickupAddress ?? "");
  const dropoffAddress = String(body.dropoffAddress ?? "");

  const routeMetrics = await resolveWorkerTripRouteMetrics({
    pickupAddress,
    dropoffAddress,
    pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
    pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
    dropoffLat: Number.isFinite(dropoffLat) ? dropoffLat : null,
    dropoffLng: Number.isFinite(dropoffLng) ? dropoffLng : null,
    googlePlacesApiKey: env?.GOOGLE_PLACES_API_KEY,
  });

  if (!routeMetrics) {
    return json(
      {
        ok: false,
        reason: "no_fare",
        message:
          "We could not measure that route confidently. Confirm both addresses from suggestions and try again.",
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
    fromAirport: body.fromAirport === true,
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

  console.log(
    JSON.stringify({
      event: "quote_calculate",
      ok: result.ok,
      reason: result.ok ? undefined : result.reason,
      airportCode,
      returnJourney,
      ownerMode,
      vehicleChoice: resolved.vehicleChoice,
      amount: result.ok ? result.amount : undefined,
    }),
  );

  if (!result.ok) {
    return json(result, 422, origin);
  }

  return json(
    {
      ...result,
      vehicleChoice: resolved.vehicleChoice,
    },
    200,
    origin,
  );
}
