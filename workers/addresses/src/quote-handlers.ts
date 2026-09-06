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
import {
  customerSmartAvailabilityPreviewRequested,
  enforceCustomerSmartAvailabilityGate,
  recordQuoteShadowSafely,
} from "./smart-ops-handlers";
import { toPublicCustomerSmartAvailability } from "../shared/customer-smart-availability";
import { resolveWorkerTripRouteMetrics } from "./resolve-route-metrics";
import { parseClientRouteMetrics } from "./parse-route-metrics";
import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";
import { resolvePaymentAirportContextFromAddresses } from "../shared/open-website-payment-fares";
import { calculateAirportToAirportQuote, formatQuote } from "../../../src/lib/quote";
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
    GETADDRESS_API_KEY?: string;
    TRACKING_STORE?: KVNamespace;
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
  const pickupPlaceId = String(body.pickupPlaceId ?? "").trim() || null;
  const dropoffPlaceId = String(body.dropoffPlaceId ?? "").trim() || null;

  const pickupAddress = String(body.pickupAddress ?? "");
  const dropoffAddress = String(body.dropoffAddress ?? "");

  // Prefer address-derived airport identity (same as SumUp payment) so display
  // and checkout share one SERVED_AIRPORTS match. Client airportCode is a hint
  // only when labels do not identify a served airport.
  const addressAirport = resolvePaymentAirportContextFromAddresses(
    pickupAddress,
    dropoffAddress,
  );
  const inferred = resolveAirportTransferIntent({
    airportCode: body.airportCode == null ? null : String(body.airportCode),
    fromAirport: typeof body.fromAirport === "boolean" ? body.fromAirport : null,
    pickupAddress,
    dropoffAddress,
  });
  const airportCode = (
    addressAirport.ok && addressAirport.context.airportCode
      ? addressAirport.context.airportCode
      : (inferred?.airportCode ?? null)
  ) as QuoteServiceAirportCode | null;
  const fromAirport =
    addressAirport.ok && addressAirport.context.isAirportTrip
      ? addressAirport.context.fromAirport
      : (inferred?.fromAirport ?? body.fromAirport === true);
  const isAirportToAirport =
    addressAirport.ok && addressAirport.context.isAirportToAirport;
  const airportCodeSource =
    addressAirport.ok &&
    (addressAirport.context.airportCode || addressAirport.context.isAirportToAirport)
      ? "addresses"
      : String(body.airportCode ?? "").trim() &&
          ["BFS", "BHD", "DUB", "LDY"].includes(String(body.airportCode).trim().toUpperCase())
        ? "client"
        : inferred
          ? "inferred"
          : "none";

  // Commercial fare requires real road routing (OSRM). Haversine×1.48 must never
  // set the price. Prefer Worker OSRM; if Workers cannot reach OSRM, accept the
  // browser's OSRM metrics (same TripMap path) rather than inventing a fare.
  let routeMetricsSource: "worker" | "client" | "none" = "none";
  let routeMetrics = await resolveWorkerTripRouteMetrics({
    pickupAddress,
    dropoffAddress,
    pickupPlaceId,
    dropoffPlaceId,
    pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
    pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
    dropoffLat: Number.isFinite(dropoffLat) ? dropoffLat : null,
    dropoffLng: Number.isFinite(dropoffLng) ? dropoffLng : null,
    googlePlacesApiKey: env?.GOOGLE_PLACES_API_KEY,
    getAddressApiKey: env?.GETADDRESS_API_KEY,
    trustClientCoordinates: true,
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
        reason: "routing_unavailable",
        message:
          "We could not measure that road route yet. Please confirm both addresses from suggestions and try again in a moment.",
        diagnostics: {
          pickupAddress,
          dropoffAddress,
          airportCode,
          fromAirport,
          airportCodeSource,
          routeMetricsSource,
          roadRoutingRequired: true,
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

  const schedule = {
    outboundDate: String(body.outboundDate ?? ""),
    outboundTime: String(body.outboundTime ?? ""),
    returnDate: String(body.returnDate ?? "") || undefined,
    returnTime: String(body.returnTime ?? "") || undefined,
    returnJourney,
  };

  let result: ReturnType<typeof calculateAuthoritativeWebsiteQuote>;

  if (
    isAirportToAirport &&
    addressAirport.ok &&
    addressAirport.context.pickupAirportCode &&
    addressAirport.context.dropoffAirportCode
  ) {
    const a2a = calculateAirportToAirportQuote(
      addressAirport.context.pickupAirportCode,
      addressAirport.context.dropoffAirportCode,
      pickupAddress,
      dropoffAddress,
      resolved.vehicleType,
      returnJourney,
      schedule,
      routeMetrics,
    );
    if (a2a && Number.isFinite(a2a.amount) && a2a.amount >= 1) {
      result = {
        ok: true,
        amount: Math.round(a2a.amount * 100) / 100,
        amountLabel: formatQuote(a2a.amount),
        currency: "GBP",
        vehicleType: resolved.vehicleType,
        premiumApplied: Boolean(a2a.premiumApplied),
        returnJourney,
        journeyFareGbp:
          typeof a2a.journeyFareGbp === "number"
            ? Math.round(a2a.journeyFareGbp * 100) / 100
            : undefined,
        airportFixedCostsGbp:
          typeof a2a.airportFixedCostsGbp === "number"
            ? Math.round(a2a.airportFixedCostsGbp * 100) / 100
            : undefined,
        source: "website-pricing-engine",
      };
    } else {
      result = {
        ok: false,
        reason: "no_fare",
        message:
          "We could not calculate a fixed online fare for that journey. Please speak to Colin and we will help.",
      };
    }
  } else {
    result = calculateAuthoritativeWebsiteQuote({
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
  }

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

  const quoteBody: Record<string, unknown> = {
    ...result,
    vehicleChoice: resolved.vehicleChoice,
    diagnostics,
  };

  if (env?.TRACKING_STORE) {
    const availabilityGate = await enforceCustomerSmartAvailabilityGate({
      store: env.TRACKING_STORE,
      origin,
      previewRequested: customerSmartAvailabilityPreviewRequested(request),
      booking: {
        pickupLabel: pickupAddress,
        dropoffLabel: dropoffAddress,
        tripDate: String(body.outboundDate ?? schedule.outboundDate ?? ""),
        tripTime: String(body.outboundTime ?? schedule.outboundTime ?? ""),
        returnJourney,
        returnDate: String(body.returnDate ?? schedule.returnDate ?? ""),
        returnTime: String(body.returnTime ?? schedule.returnTime ?? ""),
        vehicle: resolved.vehicleType,
        airportCode,
        isFromAirport: fromAirport,
        routeDurationMinutes: routeMetrics.durationMinutes,
      },
    });
    if (availabilityGate.enforce) {
      quoteBody.smartAvailability = toPublicCustomerSmartAvailability(availabilityGate);
    }
  }

  if (env?.TRACKING_STORE) {
    const outboundDate = String(body.outboundDate ?? schedule.outboundDate ?? "");
    const outboundTime = String(body.outboundTime ?? schedule.outboundTime ?? "");
    void recordQuoteShadowSafely({
      store: env.TRACKING_STORE,
      requested: {
        pickupLabel: pickupAddress,
        dropoffLabel: dropoffAddress,
        tripDate: outboundDate,
        tripTime: outboundTime,
        vehicle: resolved.vehicleType,
        airportCode,
        isFromAirport: fromAirport,
        durationMinutes: routeMetrics.durationMinutes,
      },
      liveQuoted: true,
      liveAmountGbp: result.amount,
    });
  }

  return json(quoteBody, 200, origin);
}

/**
 * POST /quote/availability — customer Smart Availability preflight.
 * Uses the same enforceCustomerSmartAvailabilityGate as /payments.
 * Never returns owner reason codes or diagnostics.
 */
export async function handleQuoteAvailabilityRequest(
  request: Request,
  origin: string | null,
  env?: {
    TRACKING_STORE?: KVNamespace;
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

  const availabilityGate = await enforceCustomerSmartAvailabilityGate({
    store: env?.TRACKING_STORE,
    origin,
    previewRequested: customerSmartAvailabilityPreviewRequested(request),
    booking: {
      pickupLabel: String(body.pickupLabel ?? body.pickupAddress ?? ""),
      dropoffLabel: String(body.dropoffLabel ?? body.dropoffAddress ?? ""),
      tripDate: String(body.tripDate ?? body.outboundDate ?? ""),
      tripTime: String(body.tripTime ?? body.outboundTime ?? ""),
      returnJourney: body.returnJourney === true,
      returnDate: String(body.returnDate ?? ""),
      returnTime: String(body.returnTime ?? ""),
      vehicle: body.vehicle == null ? null : String(body.vehicle),
      airportCode: body.airportCode == null ? null : String(body.airportCode),
      isFromAirport: body.isFromAirport === true,
      journeyDuration: body.journeyDuration == null ? null : String(body.journeyDuration),
      routeDurationMinutes:
        typeof body.routeDurationMinutes === "number"
          ? body.routeDurationMinutes
          : typeof body.durationMinutes === "number"
            ? body.durationMinutes
            : null,
      pickupLat: typeof body.pickupLat === "number" ? body.pickupLat : null,
      pickupLng: typeof body.pickupLng === "number" ? body.pickupLng : null,
      dropoffLat: typeof body.dropoffLat === "number" ? body.dropoffLat : null,
      dropoffLng: typeof body.dropoffLng === "number" ? body.dropoffLng : null,
      isRefundTest: body.isRefundTest === true,
    },
  });

  return json(
    {
      ok: true,
      ...toPublicCustomerSmartAvailability(availabilityGate),
    },
    200,
    origin,
  );
}
