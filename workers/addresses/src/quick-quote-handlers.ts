/**
 * Quick Quote Worker APIs — owner create + public lookup.
 * Fares always from calculateAuthoritativeWebsiteQuote (never from client amount).
 * Discretionary discounts are applied AFTER the engine fare and stored separately.
 */

import { corsHeaders } from "../shared/google-places";
import {
  QUICK_QUOTE_CREATE_RATE_LIMIT,
  applyQuickQuoteManualDiscount,
  buildQuickQuoteCustomerUrl,
  buildQuickQuoteWhatsAppReply,
  formatQuickQuoteAmount,
  isQuickQuoteExpired,
  normalizeQuickQuoteId,
  parseQuickQuoteDiscountType,
  parseQuickQuoteVehicleChoice,
  quickQuoteMaxPassengersForVehicle,
  toQuickQuotePublicSummary,
  type QuickQuoteAirportCode,
  type QuickQuoteDiscountType,
  type QuickQuoteJourney,
  type QuickQuoteVehicleChoice,
} from "../shared/quick-quote";
import { calculateAuthoritativeWebsiteQuote } from "../../../src/lib/quote-service";
import {
  MINIBUS_VEHICLE,
  selectVehicleForParty,
} from "../../../src/lib/vehicle-selection";
import type { VehicleType } from "../../../src/lib/data";
import { ownerAuthorized } from "./driver-auth";
import {
  consumeQuickQuoteCreateQuota,
  createQuickQuoteRecord,
  getQuickQuote,
} from "./quick-quote-store";
import { resolveWorkerTripRouteMetrics } from "./resolve-route-metrics";
import { parseClientRouteMetrics } from "./parse-route-metrics";
import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function siteOrigin(env: { SITE_ORIGIN?: string }): string {
  return (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
}

function parseAirport(value: unknown): QuickQuoteAirportCode | null {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "BFS" || code === "BHD" || code === "DUB") return code;
  return null;
}

function resolveVehicle(
  choice: QuickQuoteVehicleChoice,
  passengers: number,
  suitcases: number,
): VehicleType {
  if (choice === "Minibus") return MINIBUS_VEHICLE;
  return selectVehicleForParty(passengers, Math.max(0, suitcases));
}

function parseJourney(
  body: Record<string, unknown>,
): (QuickQuoteJourney & { vehicleChoice: QuickQuoteVehicleChoice }) | { error: string } {
  let returnJourney: boolean;
  if (typeof body.returnJourney === "boolean") {
    returnJourney = body.returnJourney;
  } else if (body.journeyMode === "one-way") {
    returnJourney = false;
  } else if (body.journeyMode === "return") {
    returnJourney = true;
  } else {
    return { error: "Journey mode (One Way or Return) is required." };
  }
  if (body.passengers == null || body.suitcases == null) {
    return { error: "Passenger and suitcase selections are required." };
  }
  const passengers = Math.floor(Number(body.passengers));
  const suitcases = Math.floor(Number(body.suitcases));
  const outboundDate = String(body.outboundDate ?? "").trim();
  const outboundTime = String(body.outboundTime ?? "").trim();
  const returnDate = String(body.returnDate ?? "").trim();
  const returnTime = String(body.returnTime ?? "").trim();
  const pickupAddress = String(body.pickupAddress ?? "").trim();
  const dropoffAddress = String(body.dropoffAddress ?? "").trim();
  const inferred = resolveAirportTransferIntent({
    airportCode: body.airportCode == null ? null : String(body.airportCode),
    fromAirport: typeof body.fromAirport === "boolean" ? body.fromAirport : null,
    pickupAddress,
    dropoffAddress,
  });
  const airportCode =
    parseAirport(inferred?.airportCode) ?? parseAirport(body.airportCode);
  const fromAirport = inferred?.fromAirport ?? body.fromAirport === true;
  const vehicleChoice = parseQuickQuoteVehicleChoice(
    body.vehicleChoice ?? body.vehiclePreference ?? body.vehicleType,
  );
  const maxPax = quickQuoteMaxPassengersForVehicle(vehicleChoice);

  if (!pickupAddress) return { error: "Pickup address is required." };
  if (!dropoffAddress) return { error: "Destination address is required." };
  // Outbound date/time optional for quote calculation; payment still requires them.
  if (returnJourney && ((returnDate && !returnTime) || (!returnDate && returnTime))) {
    return { error: "Return journeys need both return date and return time, or leave both blank." };
  }
  if (!Number.isFinite(passengers) || passengers < 1) {
    return { error: "Passenger count is required." };
  }
  if (passengers > maxPax) {
    return {
      error:
        vehicleChoice === "Minibus"
          ? `Minibus Quick Quotes are limited to ${maxPax} passengers.`
          : `Saloon Quick Quotes are limited to ${maxPax} passengers. Switch to Minibus for larger parties.`,
    };
  }
  if (!Number.isFinite(suitcases) || suitcases < 0) {
    return { error: "Luggage count is required." };
  }

  return {
    pickupAddress,
    dropoffAddress,
    airportCode,
    fromAirport,
    returnJourney,
    outboundDate,
    outboundTime,
    ...(returnJourney ? { returnDate, returnTime } : {}),
    passengers,
    suitcases,
    childSeatRequired: body.childSeatRequired === true,
    flightNumber: String(body.flightNumber ?? "").trim() || undefined,
    returnFlightNumber: String(body.returnFlightNumber ?? "").trim() || undefined,
    vehicleChoice,
  };
}

function parseDiscount(body: Record<string, unknown>): {
  discountType: QuickQuoteDiscountType;
  discountValue: number;
} {
  const discountType = parseQuickQuoteDiscountType(body.discountType);
  const discountValue = Number(body.discountValue ?? body.discountAmount ?? 0);
  return {
    discountType,
    discountValue: Number.isFinite(discountValue) ? discountValue : 0,
  };
}

async function authoritativeAmount(
  journey: QuickQuoteJourney & { vehicleChoice: QuickQuoteVehicleChoice },
  body: Record<string, unknown>,
  env: { GOOGLE_PLACES_API_KEY?: string },
) {
  const pickupLat = Number(body.pickupLat);
  const pickupLng = Number(body.pickupLng);
  const dropoffLat = Number(body.dropoffLat);
  const dropoffLng = Number(body.dropoffLng);

  // Worker resolve first; client metrics are fallback only (same as /quote/calculate).
  let routeMetrics = await resolveWorkerTripRouteMetrics({
    pickupAddress: journey.pickupAddress,
    dropoffAddress: journey.dropoffAddress,
    pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
    pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
    dropoffLat: Number.isFinite(dropoffLat) ? dropoffLat : null,
    dropoffLng: Number.isFinite(dropoffLng) ? dropoffLng : null,
    googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
  });
  if (!routeMetrics) {
    routeMetrics = parseClientRouteMetrics(body.routeMetrics);
  }

  if (!routeMetrics) {
    return {
      ok: false as const,
      reason: "no_fare" as const,
      message:
        "We could not measure that route confidently. Confirm both addresses from suggestions (or ensure map coordinates are available) and try again.",
    };
  }

  const vehicleType = resolveVehicle(
    journey.vehicleChoice,
    journey.passengers,
    journey.suitcases,
  );

  return calculateAuthoritativeWebsiteQuote({
    airportCode: journey.airportCode ?? null,
    fromAirport: Boolean(journey.fromAirport),
    pickupAddress: journey.pickupAddress,
    dropoffAddress: journey.dropoffAddress,
    returnJourney: journey.returnJourney,
    outboundDate: journey.outboundDate,
    outboundTime: journey.outboundTime,
    returnDate: journey.returnDate,
    returnTime: journey.returnTime,
    passengers: journey.passengers,
    suitcases: journey.suitcases,
    routeMetrics,
    vehicleType,
    maxPassengers: quickQuoteMaxPassengersForVehicle(journey.vehicleChoice),
  });
}

/** POST /owner/quick-quotes — create opaque booking link (owner auth). */
export async function handleOwnerCreateQuickQuote(
  request: Request,
  env: {
    TRACKING_STORE?: KVNamespace;
    OWNER_ACCESS_KEY?: string;
    DRIVER_ACCESS_KEY?: string;
    SITE_ORIGIN?: string;
    GOOGLE_PLACES_API_KEY?: string;
  },
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, 401, origin);
  }
  if (!env.TRACKING_STORE) {
    return json({ error: "Quote store is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const journey = parseJourney(body);
  if ("error" in journey) {
    return json({ error: journey.error }, 400, origin);
  }

  const ownerMaterial =
    request.headers.get("X-Owner-Key")?.trim() ||
    new URL(request.url).searchParams.get("key")?.trim() ||
    "owner";
  const quota = await consumeQuickQuoteCreateQuota(
    env.TRACKING_STORE,
    ownerMaterial,
    QUICK_QUOTE_CREATE_RATE_LIMIT,
  );
  if (quota === "limited") {
    return json(
      { error: "Quick Quote rate limit reached. Try again in an hour." },
      429,
      origin,
    );
  }

  // Ignore any client-supplied amount — always recalculate, then apply discount.
  const quote = await authoritativeAmount(journey, body, env);
  if (!quote.ok) {
    return json({ error: quote.message, reason: quote.reason }, 422, origin);
  }

  const { discountType, discountValue } = parseDiscount(body);
  const discounted = applyQuickQuoteManualDiscount(
    quote.amount,
    discountType,
    discountValue,
  );

  const record = await createQuickQuoteRecord(env.TRACKING_STORE, {
    journey: {
      ...journey,
      vehicleType: quote.vehicleType,
      vehicleChoice: journey.vehicleChoice,
    },
    quotedAmount: discounted.customerFare,
    quotedAmountLabel: formatQuickQuoteAmount(discounted.customerFare),
    calculatedAmount: discounted.calculatedFare,
    calculatedAmountLabel: formatQuickQuoteAmount(discounted.calculatedFare),
    discountType: discounted.discountType,
    discountValue: discounted.discountValue,
    discountAmount: discounted.discountAmount,
    pricingSource: "website-pricing-engine",
    createdByOwner: true,
  });

  const bookingUrl = buildQuickQuoteCustomerUrl(record.id, siteOrigin(env));
  const whatsappReply = buildQuickQuoteWhatsAppReply({
    amountLabel: record.quotedAmountLabel,
    bookingUrl,
  });

  console.log(
    JSON.stringify({
      event: "quick_quote_created",
      idSuffix: record.id.slice(-6),
      calculatedAmount: record.calculatedAmount,
      quotedAmount: record.quotedAmount,
      discountType: record.discountType,
      discountAmount: record.discountAmount,
      vehicleChoice: journey.vehicleChoice,
      returnJourney: journey.returnJourney,
      airportCode: journey.airportCode ?? null,
    }),
  );

  return json(
    {
      ok: true,
      quote: {
        ...toQuickQuotePublicSummary(record),
        calculatedAmount: record.calculatedAmount,
        calculatedAmountLabel: record.calculatedAmountLabel,
        discountType: record.discountType,
        discountValue: record.discountValue,
        discountAmount: record.discountAmount,
      },
      bookingUrl,
      whatsappReply,
    },
    200,
    origin,
  );
}

/** GET /quick-quotes/by-id?id= — public customer lookup (no secrets). */
export async function handlePublicQuickQuoteLookup(
  request: Request,
  env: { TRACKING_STORE?: KVNamespace },
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, origin);
  }
  if (!env.TRACKING_STORE) {
    return json({ error: "Quote store is not configured" }, 503, origin);
  }

  const id = normalizeQuickQuoteId(
    new URL(request.url).searchParams.get("id") ?? "",
  );
  if (!id) {
    return json({ error: "Missing quote id." }, 400, origin);
  }

  const record = await getQuickQuote(env.TRACKING_STORE, id);
  if (!record) {
    return json({ error: "This quote link is invalid or no longer available." }, 404, origin);
  }
  if (isQuickQuoteExpired(record) || record.status === "expired") {
    return json(
      {
        error: "This quote link has expired. Please contact My Airport Taxi NI for a new quote.",
        expired: true,
      },
      410,
      origin,
    );
  }
  if (record.status === "paid") {
    return json(
      {
        error: "This quote has already been paid. Check your confirmation email or contact us.",
        paid: true,
        paymentReference: record.paymentReference,
      },
      409,
      origin,
    );
  }
  if (record.status === "cancelled") {
    return json({ error: "This quote is no longer available." }, 410, origin);
  }

  return json({ ok: true, quote: toQuickQuotePublicSummary(record) }, 200, origin);
}

export function isQuickQuotePath(pathname: string): boolean {
  return (
    pathname === "/owner/quick-quotes" ||
    pathname === "/api/owner/quick-quotes" ||
    pathname === "/quick-quotes/by-id" ||
    pathname === "/api/quick-quotes/by-id"
  );
}
