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
  resolvePublicVehicleChoice,
} from "../../../src/lib/vehicle-selection";
import type { VehicleType } from "../../../src/lib/data";
import { ownerAuthorized } from "./driver-auth";
import { loadOwnerPricingOrDefault } from "./owner-pricing-handlers";
import { applyProfitabilityProtection } from "./profitability";
import { signQuoteReceipt } from "./quote-receipt";
import { isProfitabilityProtectionActive } from "../../../src/lib/owner-profitability-settings";
import {
  PUBLIC_MINIBUS_UNAVAILABLE_CODE,
  PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
  publicMaxPassengers,
  publicMinibusAllowed,
} from "../shared/owner-pricing-config";
import { needsLuggageCapacityConfirmation } from "../shared/vehicle-capacity";
import {
  isValidPublicPassengerCount,
  isValidPublicSuitcaseCount,
  publicPassengerLimitMessage,
  publicSuitcaseLimitMessage,
} from "../shared/passenger-limits";
import {
  customerSmartAvailabilityPreviewRequested,
  enforceCustomerSmartAvailabilityGate,
  recordQuoteShadowSafely,
} from "./smart-ops-handlers";
import { toPublicCustomerSmartAvailability } from "../shared/customer-smart-availability";
import {
  DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
  MINIMUM_BOOKING_NOTICE_HOURS,
  emptyPublicOwnerAvailability,
  evaluateOwnerNoAvailability,
} from "../shared/booking-notice";
import {
  availabilityResourceForVehicle,
  EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE,
  filterUnavailablePeriodsForResource,
  MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE,
} from "../shared/availability-resource";
import { getBookingSettings } from "./booking-settings-store";
import {
  defaultDepositCashSettings,
  publicDepositCashOffer,
} from "../shared/deposit-cash";
import {
  resolveWorkerTripRouteMetrics,
  resolveWorkerTripRouteMetricsForPayment,
} from "./resolve-route-metrics";
import { parseClientRouteMetrics } from "./parse-route-metrics";
import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";
import { resolvePaymentAirportContextFromAddresses } from "../shared/open-website-payment-fares";
import { calculateAirportToAirportQuote, formatQuote } from "../../../src/lib/quote";
import { drivingMilesFromKm } from "../../../src/lib/quote";

/** Repeat vehicle switches reuse the same owner config snapshot for a few seconds. */
const QUOTE_CONFIG_CACHE_MS = 10_000;
let quotePricingCache: {
  at: number;
  value: Awaited<ReturnType<typeof loadOwnerPricingOrDefault>>;
} | null = null;
let quotePricingInflight: Promise<Awaited<ReturnType<typeof loadOwnerPricingOrDefault>>> | null =
  null;
let quoteSettingsCache: {
  at: number;
  value: Awaited<ReturnType<typeof getBookingSettings>>;
} | null = null;
let quoteSettingsInflight: Promise<Awaited<ReturnType<typeof getBookingSettings>>> | null = null;

async function loadQuotePricingCached(env?: { TRACKING_STORE?: KVNamespace }) {
  const now = Date.now();
  if (quotePricingCache && now - quotePricingCache.at < QUOTE_CONFIG_CACHE_MS) {
    return quotePricingCache.value;
  }
  if (!quotePricingInflight) {
    quotePricingInflight = loadOwnerPricingOrDefault(env)
      .then((value) => {
        quotePricingCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        quotePricingInflight = null;
      });
  }
  return quotePricingInflight;
}

async function loadBookingSettingsCached(store: KVNamespace) {
  const now = Date.now();
  if (quoteSettingsCache && now - quoteSettingsCache.at < QUOTE_CONFIG_CACHE_MS) {
    return quoteSettingsCache.value;
  }
  if (!quoteSettingsInflight) {
    quoteSettingsInflight = getBookingSettings(store)
      .then((value) => {
        quoteSettingsCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        quoteSettingsInflight = null;
      });
  }
  return quoteSettingsInflight;
}

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
  publicMinibusEnabled: boolean,
  publicExecutiveEnabled: boolean,
):
  | { ok: true; vehicleType: VehicleType; vehicleChoice: QuickQuoteVehicleChoice; maxPassengers: number }
  | { ok: false; message: string } {
  const choice = parseQuickQuoteVehicleChoice(
    body.vehicleChoice ?? body.vehiclePreference ?? body.vehicleType,
  );
  if (ownerMode && choice === "Minibus") {
    return {
      ok: true,
      vehicleType: MINIBUS_VEHICLE,
      vehicleChoice: "Minibus",
      maxPassengers: quickQuoteMaxPassengersForVehicle("Minibus"),
    };
  }
  const requested = String(body.vehicleType ?? body.vehicleChoice ?? "");
  const resolved = resolvePublicVehicleChoice({
    requested,
    passengers,
    suitcases,
    publicMinibusEnabled,
    publicExecutiveEnabled,
    ownerMode,
  });
  if (!resolved.ok) return resolved;
  const vehicleChoice: QuickQuoteVehicleChoice =
    resolved.vehicleType === MINIBUS_VEHICLE ? "Minibus" : "Saloon";
  return {
    ok: true,
    vehicleType: resolved.vehicleType,
    vehicleChoice,
    maxPassengers: ownerMode
      ? quickQuoteMaxPassengersForVehicle(vehicleChoice)
      : publicMaxPassengers(publicMinibusEnabled),
  };
}

type CachedQuoteRoute = {
  metrics: { distanceKm: number; durationMinutes: number };
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  storedAt: number;
};

/** Same addresses, another vehicle: reuse the worker route instead of calling OSRM again. */
const QUOTE_ROUTE_REUSE_MS = 10 * 60 * 1000;
const quoteRouteCache = new Map<string, CachedQuoteRoute>();
const quoteRouteInflight = new Map<string, Promise<CachedQuoteRoute | null>>();

function quoteRouteReuseKey(input: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlaceId: string | null;
  dropoffPlaceId: string | null;
}): string {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return [
    norm(input.pickupAddress),
    norm(input.dropoffAddress),
    input.pickupPlaceId?.trim() ?? "",
    input.dropoffPlaceId?.trim() ?? "",
  ].join("\n");
}

async function resolveProtectedQuoteRoute(input: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlaceId: string | null;
  dropoffPlaceId: string | null;
  googlePlacesApiKey?: string;
  getAddressApiKey?: string;
}): Promise<CachedQuoteRoute | null> {
  const key = quoteRouteReuseKey(input);
  const cached = quoteRouteCache.get(key);
  if (cached && Date.now() - cached.storedAt < QUOTE_ROUTE_REUSE_MS) return cached;
  const existing = quoteRouteInflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const outcome = await resolveWorkerTripRouteMetricsForPayment({
      pickupAddress: input.pickupAddress,
      dropoffAddress: input.dropoffAddress,
      pickupPlaceId: input.pickupPlaceId,
      dropoffPlaceId: input.dropoffPlaceId,
      googlePlacesApiKey: input.googlePlacesApiKey,
      getAddressApiKey: input.getAddressApiKey,
    });
    if (!outcome.ok) return null;
    const resolved: CachedQuoteRoute = {
      metrics: outcome.metrics,
      pickup: outcome.pickup ?? null,
      dropoff: outcome.dropoff ?? null,
      storedAt: Date.now(),
    };
    quoteRouteCache.set(key, resolved);
    return resolved;
  })().finally(() => {
    if (quoteRouteInflight.get(key) === promise) quoteRouteInflight.delete(key);
  });
  quoteRouteInflight.set(key, promise);
  return promise;
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
    CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE?: string;
    QUOTE_RECEIPT_SECRET?: string;
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
  // set the price. While profitability protection is off, valid browser OSRM
  // metrics are priced immediately. While it is on, the Worker resolves place
  // IDs itself — the same inputs payment would use — and signs that fare.
  const clientMetrics = parseClientRouteMetrics(body.routeMetrics);
  const stageStartedAt = Date.now();
  const pricingPromise = loadQuotePricingCached(env);
  const settingsPromise = env?.TRACKING_STORE
    ? loadBookingSettingsCached(env.TRACKING_STORE)
    : Promise.resolve(null);
  const pricingForRoute = await pricingPromise;
  const protectionActive = isProfitabilityProtectionActive(pricingForRoute.profitability);
  let routeMetricsSource: "worker" | "client" | "none" = "none";
  let routeMetrics = protectionActive ? null : clientMetrics;
  let serverPickup: { lat: number; lng: number } | null = null;
  let serverDropoff: { lat: number; lng: number } | null = null;
  let routeReused = false;
  if (protectionActive) {
    const routeKey = quoteRouteReuseKey({
      pickupAddress,
      dropoffAddress,
      pickupPlaceId,
      dropoffPlaceId,
    });
    const cachedBefore = quoteRouteCache.get(routeKey);
    routeReused =
      quoteRouteInflight.has(routeKey) ||
      (cachedBefore != null && Date.now() - cachedBefore.storedAt < QUOTE_ROUTE_REUSE_MS);
    const resolved = await resolveProtectedQuoteRoute({
      pickupAddress,
      dropoffAddress,
      pickupPlaceId,
      dropoffPlaceId,
      googlePlacesApiKey: env?.GOOGLE_PLACES_API_KEY,
      getAddressApiKey: env?.GETADDRESS_API_KEY,
    });
    if (resolved) {
      routeMetrics = resolved.metrics;
      routeMetricsSource = "worker";
      serverPickup = resolved.pickup;
      serverDropoff = resolved.dropoff;
    }
  } else if (routeMetrics) {
    routeMetricsSource = "client";
  } else {
    routeMetrics = await resolveWorkerTripRouteMetrics({
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
    }
  }
  const routeReadyAt = Date.now();

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

  // Booking settings (notice, deposit, owner blocked periods) overlap pricing.
  // The occupied-jobs availability scan is not part of the fare. The quote page
  // already calls /quote/availability, and payment runs the same gate again.
  const pricing = await pricingPromise;
  const pricingReadyAt = Date.now();

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
  const publicMinibusEnabled = pricing.minibus.publicEnabled === true;
  if (
    !ownerMode &&
    !isValidPublicPassengerCount(Math.floor(passengers), publicMinibusEnabled)
  ) {
    return json(
      {
        ok: false,
        reason: "passenger_limit",
        message: publicPassengerLimitMessage(publicMinibusEnabled),
      },
      422,
      origin,
    );
  }
  if (
    !ownerMode &&
    !isValidPublicSuitcaseCount(Math.floor(suitcases), publicMinibusEnabled)
  ) {
    return json(
      {
        ok: false,
        reason: "luggage_limit",
        message: publicSuitcaseLimitMessage(publicMinibusEnabled),
      },
      422,
      origin,
    );
  }
  const publicExecutiveEnabled = pricing.executive?.publicEnabled !== false;
  const resolved = resolveVehicleType(
    body,
    Math.floor(passengers),
    Math.floor(suitcases),
    ownerMode,
    publicMinibusEnabled,
    publicExecutiveEnabled,
  );
  if (!resolved.ok) {
    return json(
      {
        ok: false,
        reason: "vehicle_unavailable",
        message: resolved.message,
      },
      409,
      origin,
    );
  }
  if (
    !publicMinibusAllowed(resolved.vehicleType, {
      publicMinibusEnabled,
      ownerMode,
    })
  ) {
    return json(
      {
        ok: false,
        reason: "vehicle_unavailable",
        code: PUBLIC_MINIBUS_UNAVAILABLE_CODE,
        message: PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
      },
      409,
      origin,
    );
  }

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
      pricing,
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
        nightWeekendSurchargeGbp:
          typeof a2a.nightWeekendSurchargeGbp === "number"
            ? Math.round(a2a.nightWeekendSurchargeGbp * 100) / 100
            : undefined,
        airportFixedCostsGbp:
          typeof a2a.airportFixedCostsGbp === "number"
            ? Math.round(a2a.airportFixedCostsGbp * 100) / 100
            : undefined,
        source: "website-pricing-engine",
        needsLuggageCapacityConfirmation: needsLuggageCapacityConfirmation(
          passengers,
          suitcases,
        ),
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
      enforceAirportPickupServiceArea: !ownerMode,
      destinationLat: Number.isFinite(dropoffLat) ? dropoffLat : null,
      destinationLng: Number.isFinite(dropoffLng) ? dropoffLng : null,
      pricing,
      ownerMode,
    });
  }

  if (result.ok) {
    const protectedFare = await applyProfitabilityProtection({
      pricing,
      vehicleType: result.vehicleType,
      routeMetrics,
      pickup: protectionActive
        ? serverPickup
        : Number.isFinite(pickupLat) && Number.isFinite(pickupLng)
          ? { lat: pickupLat, lng: pickupLng }
          : null,
      dropoff: protectionActive
        ? serverDropoff
        : Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng)
          ? { lat: dropoffLat, lng: dropoffLng }
          : null,
      returnJourney,
      schedule,
      existing: {
        amountGbp: result.amount,
        journeyFareGbp: result.journeyFareGbp ?? result.amount,
        airportFixedCostsGbp: result.airportFixedCostsGbp ?? 0,
        nightWeekendSurchargeGbp: result.nightWeekendSurchargeGbp ?? 0,
      },
    });
    if (protectedFare.applied) {
      result = {
        ...result,
        amount: protectedFare.amountGbp,
        amountLabel: formatQuote(protectedFare.amountGbp),
        journeyFareGbp: protectedFare.journeyFareGbp,
        airportFixedCostsGbp: protectedFare.airportFixedCostsGbp,
        nightWeekendSurchargeGbp: protectedFare.nightWeekendSurchargeGbp,
        premiumApplied: protectedFare.nightWeekendSurchargeGbp > 0,
      };
    }
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
    routeReused,
    routeMiles: miles,
    routeDurationMinutes: Math.round(routeMetrics.durationMinutes * 10) / 10,
    distanceKm: Math.round(routeMetrics.distanceKm * 100) / 100,
    workerHost: "reimagined-octo-meme.cgr28.workers.dev",
    stageMs: {
      route: routeReadyAt - stageStartedAt,
      pricing: pricingReadyAt - stageStartedAt,
      fare: 0,
      availability: 0,
      settings: 0,
      total: 0,
    },
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
      routeReused,
      returnJourney,
      ownerMode,
      vehicleChoice: resolved.vehicleChoice,
      amount: result.ok ? result.amount : undefined,
      miles,
    }),
  );

  if (!result.ok) {
    const status = result.reason === "vehicle_unavailable" ? 409 : 422;
    return json({ ...result, diagnostics }, status, origin);
  }

  const quoteBody: Record<string, unknown> = {
    ...result,
    vehicleChoice: resolved.vehicleChoice,
    diagnostics,
  };

  if (protectionActive && result.ok) {
    const secret = env?.QUOTE_RECEIPT_SECRET?.trim() ?? "";
    if (!secret) {
      console.warn("[quote-receipt] refresh reason=secret_missing");
      return json(
        {
          ok: false,
          reason: "quote_refresh_required",
          message: "Quote amount is out of date. Please refresh your quote and try again.",
        },
        503,
        origin,
      );
    }
    quoteBody.quoteReceipt = await signQuoteReceipt(
      {
        pricingVersion: pricingForRoute.version,
        pickupPlaceId: pickupPlaceId ?? "",
        dropoffPlaceId: dropoffPlaceId ?? "",
        pickupAddress,
        dropoffAddress,
        vehicleType: result.vehicleType,
        passengers,
        suitcases,
        outboundDate: schedule.outboundDate,
        outboundTime: schedule.outboundTime,
        returnJourney,
        returnDate: schedule.returnDate ?? "",
        returnTime: schedule.returnTime ?? "",
        journeyFareGbp: result.journeyFareGbp ?? result.amount,
        airportFixedCostsGbp: result.airportFixedCostsGbp ?? 0,
        nightWeekendSurchargeGbp: result.nightWeekendSurchargeGbp ?? 0,
        transferAmountGbp: result.amount,
        distanceKm: routeMetrics.distanceKm,
        durationMinutes: routeMetrics.durationMinutes,
      },
      secret,
      Date.now(),
    );
  }

  const fareReadyAt = Date.now();
  if (env?.TRACKING_STORE) {
    const settings = await settingsPromise;
    const settingsReadyAt = Date.now();
    diagnostics.stageMs = {
      route: routeReadyAt - stageStartedAt,
      pricing: pricingReadyAt - stageStartedAt,
      fare: fareReadyAt - stageStartedAt,
      availability: 0,
      settings: settingsReadyAt - stageStartedAt,
      total: settingsReadyAt - stageStartedAt,
    };
    if (settings) {
      quoteBody.minimumBookingNoticeHours = settings.minimumBookingNoticeHours;
      quoteBody.minibusMinimumBookingNoticeHours = settings.minibusMinimumBookingNoticeHours;
      if (!ownerMode) {
        quoteBody.depositCash = publicDepositCashOffer(result.amount, settings.depositCash);
      }
      const quoteResource = availabilityResourceForVehicle(resolved.vehicleType);
      const quoteAvailability = evaluateOwnerNoAvailability(
        {
          tripDate: String(body.outboundDate ?? schedule.outboundDate ?? ""),
          tripTime: String(body.outboundTime ?? schedule.outboundTime ?? ""),
          returnJourney,
          returnDate: String(body.returnDate ?? schedule.returnDate ?? ""),
          returnTime: String(body.returnTime ?? schedule.returnTime ?? ""),
          routeDurationMinutes: routeMetrics.durationMinutes,
          vehicle: resolved.vehicleType,
        },
        filterUnavailablePeriodsForResource(settings.unavailablePeriods, quoteResource),
      );
      quoteBody.ownerAvailability =
        quoteAvailability.blocked && quoteResource === "minibus"
          ? { ...quoteAvailability, customerMessage: MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE }
          : quoteAvailability.blocked && quoteResource === "executive"
            ? { ...quoteAvailability, customerMessage: EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE }
            : quoteAvailability;
    }
  }

  if (!quoteBody.depositCash && !ownerMode) {
    quoteBody.depositCash = publicDepositCashOffer(result.amount, defaultDepositCashSettings());
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
    CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE?: string;
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
    previewWorkerEnforce: env?.CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE === "1",
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

  const settings = env?.TRACKING_STORE
    ? await getBookingSettings(env.TRACKING_STORE)
    : null;
  const noticeHours = settings?.minimumBookingNoticeHours ?? MINIMUM_BOOKING_NOTICE_HOURS;
  const minibusNoticeHours =
    settings?.minibusMinimumBookingNoticeHours ?? DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS;
  const requestedVehicle = body.vehicle == null ? null : String(body.vehicle);
  const quoteResource = availabilityResourceForVehicle(requestedVehicle);
  const ownerAvailability = settings
    ? evaluateOwnerNoAvailability(
        {
          tripDate: String(body.tripDate ?? body.outboundDate ?? ""),
          tripTime: String(body.tripTime ?? body.outboundTime ?? ""),
          returnJourney: body.returnJourney === true,
          returnDate: String(body.returnDate ?? ""),
          returnTime: String(body.returnTime ?? ""),
          routeDurationMinutes:
            typeof body.routeDurationMinutes === "number"
              ? body.routeDurationMinutes
              : typeof body.durationMinutes === "number"
                ? body.durationMinutes
                : null,
          journeyDuration: body.journeyDuration == null ? null : String(body.journeyDuration),
          vehicle: requestedVehicle,
        },
        filterUnavailablePeriodsForResource(settings.unavailablePeriods, quoteResource),
      )
    : emptyPublicOwnerAvailability();
  const publicOwnerAvailability =
    ownerAvailability.blocked && quoteResource === "minibus"
      ? { ...ownerAvailability, customerMessage: MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE }
      : ownerAvailability.blocked && quoteResource === "executive"
        ? { ...ownerAvailability, customerMessage: EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE }
        : ownerAvailability;

  return json(
    {
      ok: true,
      ...toPublicCustomerSmartAvailability(availabilityGate),
      minimumBookingNoticeHours: noticeHours,
      minibusMinimumBookingNoticeHours: minibusNoticeHours,
      ownerAvailability: publicOwnerAvailability,
    },
    200,
    origin,
  );
}
