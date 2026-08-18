/**
 * Quick Quote Worker APIs — owner create + public lookup.
 * Fares always from calculateAuthoritativeWebsiteQuote (never from client amount).
 */

import { corsHeaders } from "../shared/google-places";
import {
  QUICK_QUOTE_CREATE_RATE_LIMIT,
  QUICK_QUOTE_MAX_PASSENGERS,
  buildQuickQuoteCustomerUrl,
  buildQuickQuoteWhatsAppReply,
  formatQuickQuoteAmount,
  isQuickQuoteExpired,
  normalizeQuickQuoteId,
  toQuickQuotePublicSummary,
  type QuickQuoteAirportCode,
  type QuickQuoteJourney,
} from "../shared/quick-quote";
import { calculateAuthoritativeWebsiteQuote } from "../../../src/lib/quote-service";
import { fetchTripRouteMetrics } from "../../../src/lib/trip-route";
import { ownerAuthorized } from "./driver-auth";
import {
  consumeQuickQuoteCreateQuota,
  createQuickQuoteRecord,
  getQuickQuote,
} from "./quick-quote-store";

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

function parseJourney(body: Record<string, unknown>): QuickQuoteJourney | { error: string } {
  const airportCode = parseAirport(body.airportCode);
  const returnJourney = body.returnJourney === true;
  const passengers = Math.floor(Number(body.passengers));
  const suitcases = Math.floor(Number(body.suitcases));
  const outboundDate = String(body.outboundDate ?? "").trim();
  const outboundTime = String(body.outboundTime ?? "").trim();
  const returnDate = String(body.returnDate ?? "").trim();
  const returnTime = String(body.returnTime ?? "").trim();
  const pickupAddress = String(body.pickupAddress ?? "").trim();
  const dropoffAddress = String(body.dropoffAddress ?? "").trim();
  const fromAirport = body.fromAirport === true;

  if (!pickupAddress) return { error: "Pickup address is required." };
  if (!dropoffAddress) return { error: "Destination address is required." };
  if (!outboundDate || !outboundTime) {
    return { error: "Outbound date and time are required." };
  }
  if (returnJourney && (!returnDate || !returnTime)) {
    return { error: "Return journeys require both return date and return time." };
  }
  if (!Number.isFinite(passengers) || passengers < 1) {
    return { error: "Passenger count is required." };
  }
  if (passengers > QUICK_QUOTE_MAX_PASSENGERS) {
    return {
      error: `Online Quick Quotes are limited to ${QUICK_QUOTE_MAX_PASSENGERS} passengers. Speak to the customer for larger parties.`,
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
  };
}

async function authoritativeAmount(journey: QuickQuoteJourney, body: Record<string, unknown>) {
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

  // Ignore any client-supplied amount — always recalculate.
  const quote = await authoritativeAmount(journey, body);
  if (!quote.ok) {
    return json({ error: quote.message, reason: quote.reason }, 422, origin);
  }

  const record = await createQuickQuoteRecord(env.TRACKING_STORE, {
    journey: {
      ...journey,
      vehicleType: quote.vehicleType,
    },
    quotedAmount: quote.amount,
    quotedAmountLabel: quote.amountLabel || formatQuickQuoteAmount(quote.amount),
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
      amount: record.quotedAmount,
      returnJourney: journey.returnJourney,
      airportCode: journey.airportCode ?? null,
    }),
  );

  return json(
    {
      ok: true,
      quote: toQuickQuotePublicSummary(record),
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
