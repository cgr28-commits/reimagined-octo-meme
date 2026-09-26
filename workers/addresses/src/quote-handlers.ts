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
import { loadOwnerPricingOrDefault } from "./owner-pricing-handlers";
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
  MINIMUM_BOOKING_NOTICE_HOURS,
  emptyPublicOwnerAvailability,
  evaluateOwnerNoAvailability,
} from "../shared/booking-notice";
import { getBookingSettings } from "./booking-settings-store";
import {
  defaultDepositCashSettings,
  publicDepositCashOffer,
} from "../shared/deposit-cash";
import { resolveWorkerTripRouteMetrics } from "./resolve-route-metrics";
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
  const requested = String(body.vehicleType ?? body.vehicleChoice ?? "");
  if (
    !ownerMode &&
    publicMinibusEnabled &&
    (choice === "Minibus" || requested.toLowerCase().includes("minibus"))
  ) {
    return {
      vehicleType: MINIBUS_VEHICLE,
      vehicleChoice: "Minibus",
      maxPassengers: publicMaxPassengers(true),
    };
  }
  const selected = selectVehicleForParty(passengers, Math.max(0, suitcases));
  if (selected === MINIBUS_VEHICLE && !ownerMode && !publicMinibusEnabled) {
    return {
      vehicleType: selected,
      vehicleChoice: "Minibus",
      maxPassengers: publicMaxPassengers(false),
    };
  }
  return {
    vehicleType: selected,
    vehicleChoice: selected === MINIBUS_VEHICLE ? "Minibus" : "Saloon",
    maxPassengers: ownerMode
      ? quickQuoteMaxPassengersForVehicle(selected === MINIBUS_VEHICLE ? "Minibus" : "Saloon")
      : publicMaxPassengers(publicMinibusEnabled),
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
  // set the price. Valid browser OSRM metrics are priced immediately — TripMap
  // already measured this route — so the quote does not wait on a second OSRM
  // call. Worker resolve runs only when those metrics are missing. Payment
  // still uses resolveWorkerTripRouteMetricsForPayment and never trusts this body.
  const clientMetrics = parseClientRouteMetrics(body.routeMetrics);
  const stageStartedAt = Date.now();
  const pricingPromise = loadQuotePricingCached(env);
  const settingsPromise = env?.TRACKING_STORE
    ? loadBookingSettingsCached(env.TRACKING_STORE)
    : Promise.resolve(null);
  let routeMetricsSource: "worker" | "client" | "none" = "none";
  let routeMetrics = clientMetrics;
  if (routeMetrics) {
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

  // Availability and booking settings do not change the fare. Start them now so
  // their KV reads overlap the pricing snapshot instead of following it.
  const availabilityPromise =
    env?.TRACKING_STORE && routeMetrics
      ? enforceCustomerSmartAvailabilityGate({
          store: env.TRACKING_STORE,
          origin,
          previewRequested: customerSmartAvailabilityPreviewRequested(request),
          previewWorkerEnforce: env.CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE === "1",
          booking: {
            pickupLabel: pickupAddress,
            dropoffLabel: dropoffAddress,
            tripDate: String(body.outboundDate ?? ""),
            tripTime: String(body.outboundTime ?? ""),
            returnJourney,
            returnDate: String(body.returnDate ?? ""),
            returnTime: String(body.returnTime ?? ""),
            vehicle: String(body.vehicleType ?? body.vehicleChoice ?? ""),
            airportCode,
            isFromAirport: fromAirport,
            routeDurationMinutes: routeMetrics.durationMinutes,
          },
        })
      : Promise.resolve(null);
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
  const resolved = resolveVehicleType(
    body,
    Math.floor(passengers),
    Math.floor(suitcases),
    ownerMode,
    publicMinibusEnabled,
  );
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

  const fareReadyAt = Date.now();
  if (env?.TRACKING_STORE) {
    const availabilityGate = await availabilityPromise;
    const availabilityReadyAt = Date.now();
    if (availabilityGate?.enforce) {
      quoteBody.smartAvailability = toPublicCustomerSmartAvailability(availabilityGate);
    }
    const settings = await settingsPromise;
    const settingsReadyAt = Date.now();
    diagnostics.stageMs = {
      route: routeReadyAt - stageStartedAt,
      pricing: pricingReadyAt - stageStartedAt,
      fare: fareReadyAt - stageStartedAt,
      availability: availabilityReadyAt - stageStartedAt,
      settings: settingsReadyAt - stageStartedAt,
      total: settingsReadyAt - stageStartedAt,
    };
    if (settings) {
      quoteBody.minimumBookingNoticeHours = settings.minimumBookingNoticeHours;
      if (!ownerMode) {
        quoteBody.depositCash = publicDepositCashOffer(result.amount, settings.depositCash);
      }
      quoteBody.ownerAvailability = evaluateOwnerNoAvailability(
        {
          tripDate: String(body.outboundDate ?? schedule.outboundDate ?? ""),
          tripTime: String(body.outboundTime ?? schedule.outboundTime ?? ""),
          returnJourney,
          returnDate: String(body.returnDate ?? schedule.returnDate ?? ""),
          returnTime: String(body.returnTime ?? schedule.returnTime ?? ""),
          routeDurationMinutes: routeMetrics.durationMinutes,
        },
        settings.unavailablePeriods,
      );
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
        },
        settings.unavailablePeriods,
      )
    : emptyPublicOwnerAvailability();

  return json(
    {
      ok: true,
      ...toPublicCustomerSmartAvailability(availabilityGate),
      minimumBookingNoticeHours: noticeHours,
      ownerAvailability,
    },
    200,
    origin,
  );
}
