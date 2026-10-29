/**
 * Quick Quote Worker APIs — owner create + public lookup.
 * Website fares always from the public quote tool's own calculation (never from client amount).
 * Owner-manual fares use an authenticated transfer amount stored in KV; browsers never alter it.
 * Discretionary discounts are applied AFTER the transfer fare and stored separately.
 */

import { corsHeaders } from "../shared/google-places";
import { mainQuoteRequestBody, priceWithMainQuoteTool, type MainQuoteEnv } from "./main-quote-pricing";
import {
  QUICK_QUOTE_CREATE_RATE_LIMIT,
  applyQuickQuoteManualDiscount,
  assertQuickQuoteTransferFareFloor,
  buildQuickQuoteCustomerUrl,
  buildQuickQuoteWhatsAppReply,
  formatQuickQuoteAmount,
  isQuickQuoteExpired,
  normalizeQuickQuoteId,
  parseQuickQuoteDiscountType,
  parseQuickQuoteManualTransferFare,
  parseQuickQuotePriceSource,
  parseQuickQuoteVehicleChoice,
  quickQuoteCalculatedAmount,
  quickQuoteMaxPassengersForVehicle,
  quickQuoteTransferFareGbp,
  resolveQuickQuoteTtlSeconds,
  toQuickQuotePublicSummary,
  type QuickQuoteAirportCode,
  type QuickQuoteDiscountType,
  type QuickQuoteJourney,
  type QuickQuotePriceSource,
  type QuickQuoteRecord,
  type QuickQuoteVehicleChoice,
} from "../shared/quick-quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  selectVehicleForParty,
} from "../../../src/lib/vehicle-selection";
import type { VehicleType } from "../../../src/lib/data";
import { ownerAuthorized } from "./driver-auth";
import {
  consumeQuickQuoteCreateQuota,
  createQuickQuoteRecord,
  getQuickQuote,
  saveQuickQuote,
} from "./quick-quote-store";
import { tripSurchargeRate } from "../../../src/lib/point-to-point-premium";
import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";
import {
  composeFareWithExpressDropOff,
  resolveExpressDropOff,
  toExpressDropOffPersistedFields,
} from "../shared/express-drop-off";
import { isExecutiveVehicle } from "../shared/executive-vehicle";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import {
  ownerPricingEngineOptions,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { loadOwnerPricingOrDefault } from "./owner-pricing-handlers";

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
  if (choice === "Estate") return ESTATE_VEHICLE;
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
          : `${vehicleChoice} Quick Quotes are limited to ${maxPax} passengers. Switch to Minibus for larger parties.`,
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

export type PricedQuickQuoteResult =
  | {
      ok: true;
      record: QuickQuoteRecord;
      bookingUrl: string;
      whatsappReply: string;
      vehicleChoice: QuickQuoteVehicleChoice;
      expressFields: ReturnType<typeof toExpressDropOffPersistedFields>;
    }
  | { ok: false; status: number; error: string; reason?: string };

type QuickQuotePricing = {
  journey: QuickQuoteJourney;
  vehicleTypeLabel: string | undefined;
  pricingSource: QuickQuotePriceSource;
  discounted: ReturnType<typeof applyQuickQuoteManualDiscount>;
  expressFields: ReturnType<typeof toExpressDropOffPersistedFields>;
  composed: ReturnType<typeof composeFareWithExpressDropOff>;
  ttlSeconds: number | null;
};

/**
 * Price a journey and store it as an opaque Quick Quote booking link.
 * Shared by the owner Quick Quote tool and the WhatsApp quote assistant.
 * Callers handle auth and rate limits.
 */
export async function createPricedQuickQuote(
  body: Record<string, unknown>,
  env: {
    TRACKING_STORE: KVNamespace;
    SITE_ORIGIN?: string;
    GOOGLE_PLACES_API_KEY?: string;
  } & NonNullable<MainQuoteEnv>,
  meta: {
    createdByOwner: boolean;
    /** Owner's own request: its credentials are forwarded so owner-only vehicles price as in the owner tools. */
    request?: Request;
  },
): Promise<PricedQuickQuoteResult> {
  const priced = await priceQuickQuoteBody(body, env, meta);
  if (!priced.ok) return priced;
  const { journey, vehicleTypeLabel, pricingSource, discounted, expressFields, composed, ttlSeconds } = priced.pricing;

  const record = await createQuickQuoteRecord(env.TRACKING_STORE, {
    journey: {
      ...journey,
      vehicleType: vehicleTypeLabel,
      vehicleChoice: journey.vehicleChoice,
      expressDropOffSelected: expressFields.expressDropOffSelected,
      expressDropOffFee: expressFields.expressDropOffFee,
      expressDropOffAirport: expressFields.expressDropOffAirport,
    },
    quotedAmount: composed.totalGbp,
    quotedAmountLabel: formatQuickQuoteAmount(composed.totalGbp),
    calculatedAmount: discounted.calculatedFare,
    calculatedAmountLabel: formatQuickQuoteAmount(discounted.calculatedFare),
    discountType: discounted.discountType,
    discountValue: discounted.discountValue,
    discountAmount: discounted.discountAmount,
    pricingSource,
    createdByOwner: meta.createdByOwner,
    ttlSeconds,
  });

  const bookingUrl = buildQuickQuoteCustomerUrl(record.id, siteOrigin(env));
  const whatsappReply = buildQuickQuoteWhatsAppReply({
    amountLabel: record.quotedAmountLabel,
    bookingUrl,
  });

  return {
    ok: true,
    record,
    bookingUrl,
    whatsappReply,
    vehicleChoice: journey.vehicleChoice,
    expressFields,
  };
}

/** Pricing only (no storage) — the same calculation createPricedQuickQuote stores. */
async function priceQuickQuoteBody(
  body: Record<string, unknown>,
  env: {
    TRACKING_STORE: KVNamespace;
    SITE_ORIGIN?: string;
    GOOGLE_PLACES_API_KEY?: string;
  } & NonNullable<MainQuoteEnv>,
  meta: {
    createdByOwner: boolean;
    /** Owner's own request: its credentials are forwarded so owner-only vehicles price as in the owner tools. */
    request?: Request;
  },
): Promise<{ ok: true; pricing: QuickQuotePricing } | { ok: false; status: number; error: string; reason?: string }> {
  const journey = parseJourney(body);
  if ("error" in journey) {
    return { ok: false, status: 400, error: journey.error };
  }

  const pricingSource: QuickQuotePriceSource = parseQuickQuotePriceSource(
    body.priceSource ?? body.pricingSource,
  );
  const { discountType, discountValue } = parseDiscount(body);

  let transferFareBeforeDiscount: number;
  let vehicleTypeLabel: string | undefined = journey.vehicleType;
  let executivePayableIncludesAccess = false;

  if (pricingSource === "owner-manual") {
    const manual = parseQuickQuoteManualTransferFare(
      body.manualTransferFare ?? body.manualAmount ?? body.transferFareGbp,
    );
    if (!manual.ok) {
      return { ok: false, status: 400, error: manual.message };
    }
    transferFareBeforeDiscount = manual.amount;
    vehicleTypeLabel =
      journey.vehicleChoice === "Minibus"
        ? "Minibus (partner / on request)"
        : resolveVehicle(journey.vehicleChoice, journey.passengers, journey.suitcases);
  } else {
    const ownerPricing = await loadOwnerPricingOrDefault(env);
    // Same calculation as the public quote tool (live owner settings, route,
    // surcharges, drive-to-pickup charge). Only addresses/place IDs are sent.
    const quote = await priceWithMainQuoteTool(
      mainQuoteRequestBody({
        pickupAddress: journey.pickupAddress,
        dropoffAddress: journey.dropoffAddress,
        pickupPlaceId: typeof body.pickupPlaceId === "string" ? body.pickupPlaceId : null,
        dropoffPlaceId: typeof body.dropoffPlaceId === "string" ? body.dropoffPlaceId : null,
        airportCode: journey.airportCode ?? null,
        fromAirport: journey.fromAirport,
        returnJourney: journey.returnJourney,
        outboundDate: journey.outboundDate,
        outboundTime: journey.outboundTime,
        returnDate: journey.returnDate,
        returnTime: journey.returnTime,
        passengers: journey.passengers,
        suitcases: journey.suitcases,
        // Same vehicle the Quick Quote tool always chose (Saloon → best-fit car,
        // e.g. Estate for 3 passengers with 3 cases; Minibus stays owner-only).
        ...(journey.vehicleChoice === "Minibus"
          ? { vehicleChoice: "Minibus" }
          : { vehicleType: resolveVehicle(journey.vehicleChoice, journey.passengers, journey.suitcases) }),
      }),
      env,
      meta.request ? { forwardAuthFrom: meta.request } : {},
    );
    if (!quote.ok) {
      return { ok: false, status: 422, error: quote.message, reason: quote.reason };
    }
    transferFareBeforeDiscount = quote.amount;
    vehicleTypeLabel = quote.vehicleType;
    if (isExecutiveVehicle(quote.vehicleType)) {
      const options = ownerPricingEngineOptions(ownerPricing);
      const express = resolveExpressDropOff({
        airportCode: journey.airportCode,
        fromAirport: journey.fromAirport,
        returnJourney: journey.returnJourney,
        selected: true,
        outboundSelected: true,
        returnSelected: true,
      });
      const access = quoteAirportAccessCharges({
        expressLegs: express.legs,
        airportCode: journey.airportCode,
        fromAirport: journey.fromAirport,
        returnJourney: journey.returnJourney,
        fees: ownerPricing.meetGreet,
        meetGreetIncluded: true,
      });
      transferFareBeforeDiscount = composeWebsiteFareBreakdown({
        journeyFareBeforeAirportAccessGbp: quote.journeyFareGbp ?? quote.amount,
        airportFixedCostsGbp: quote.airportFixedCostsGbp ?? 0,
        nightWeekendSurchargeGbp: quote.nightWeekendSurchargeGbp ?? 0,
        airportAccessChargeGbp: access.airportAccessChargeGbp,
        outboundAirportAccessChargeGbp: access.outboundAirportAccessChargeGbp,
        returnAirportAccessChargeGbp: access.returnAirportAccessChargeGbp,
        returnJourney: quote.returnJourney,
        businessClassMinimumFareGbp: options.executiveMinimumFareGbp,
        outboundOneWayBeforeAccessGbp: quote.outboundOneWayBeforeAccessGbp,
        returnOneWayBeforeAccessGbp: quote.returnOneWayBeforeAccessGbp,
        returnDiscountRate: options.returnDiscountRate,
      }).finalAmountPayableGbp;
      executivePayableIncludesAccess = true;
    }
  }

  const discounted = applyQuickQuoteManualDiscount(
    transferFareBeforeDiscount,
    discountType,
    discountValue,
  );
  const floor = assertQuickQuoteTransferFareFloor(discounted.customerFare);
  if (!floor.ok) {
    return { ok: false, status: 400, error: floor.message };
  }

  let ttlSeconds: number | null;
  try {
    ttlSeconds = resolveQuickQuoteTtlSeconds({
      validityMode: body.validityMode,
      validityDays: body.validityDays,
      ttlSeconds: body.ttlSeconds,
    });
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: err instanceof Error ? err.message : "Invalid quote validity.",
    };
  }

  const expressSelection = resolveExpressDropOff({
    airportCode: journey.airportCode,
    fromAirport: journey.fromAirport,
    returnJourney: journey.returnJourney,
    selected: body.expressDropOffSelected !== false,
  });
  const expressFields = toExpressDropOffPersistedFields(expressSelection);
  const composed = composeFareWithExpressDropOff({
    transferFareGbp: discounted.customerFare,
    expressDropOffFeeGbp: executivePayableIncludesAccess ? 0 : expressFields.expressDropOffFee,
  });

  return {
    ok: true,
    pricing: { journey, vehicleTypeLabel, pricingSource, discounted, expressFields, composed, ttlSeconds },
  };
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

  const parsedJourney = parseJourney(body);
  if ("error" in parsedJourney) {
    return json({ error: parsedJourney.error }, 400, origin);
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

  const priced = await createPricedQuickQuote(
    body,
    { ...env, TRACKING_STORE: env.TRACKING_STORE },
    { createdByOwner: true, request },
  );
  if (!priced.ok) {
    return json(
      priced.reason ? { error: priced.error, reason: priced.reason } : { error: priced.error },
      priced.status,
      origin,
    );
  }
  const { record, bookingUrl, whatsappReply, vehicleChoice, expressFields } = priced;

  console.log(
    JSON.stringify({
      event: "quick_quote_created",
      idSuffix: record.id.slice(-6),
      pricingSource: record.pricingSource,
      calculatedAmount: record.calculatedAmount,
      quotedAmount: record.quotedAmount,
      discountType: record.discountType,
      discountAmount: record.discountAmount,
      expiresAt: record.expiresAt,
      vehicleChoice,
      returnJourney: record.journey.returnJourney,
      airportCode: record.journey.airportCode ?? null,
      expressDropOffSelected: expressFields.expressDropOffSelected,
      expressDropOffFee: expressFields.expressDropOffFee,
      expressDropOffAirport: expressFields.expressDropOffAirport,
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

export type QuickQuoteSchedule = {
  outboundDate: string;
  outboundTime: string;
  returnDate?: string;
  returnTime?: string;
};

const SCHEDULE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Validated new pickup date/time(s) for a quote, or an error. */
export function parseQuickQuoteSchedule(
  body: Record<string, unknown>,
  returnJourney: boolean,
): QuickQuoteSchedule | { error: string } {
  const outboundDate = String(body.outboundDate ?? body.tripDate ?? "").trim();
  const outboundTime = String(body.outboundTime ?? body.tripTime ?? "").trim();
  if (!SCHEDULE_DATE.test(outboundDate) || !SCHEDULE_TIME.test(outboundTime)) {
    return { error: "Please enter a valid pickup date and time." };
  }
  if (!returnJourney) return { outboundDate, outboundTime };
  const returnDate = String(body.returnDate ?? "").trim();
  const returnTime = String(body.returnTime ?? "").trim();
  if (!returnDate && !returnTime) return { outboundDate, outboundTime };
  if (!SCHEDULE_DATE.test(returnDate) || !SCHEDULE_TIME.test(returnTime)) {
    return { error: "Please enter a valid return date and time." };
  }
  return { outboundDate, outboundTime, returnDate, returnTime };
}

export function quickQuoteScheduleChanged(journey: QuickQuoteJourney, next: QuickQuoteSchedule): boolean {
  return (
    journey.outboundDate !== next.outboundDate ||
    journey.outboundTime !== next.outboundTime ||
    (journey.returnJourney &&
      ((journey.returnDate ?? "") !== (next.returnDate ?? "") || (journey.returnTime ?? "") !== (next.returnTime ?? "")))
  );
}

/**
 * Owner-set (manual) fares, or when the route can't be re-run: scale the fare by the
 * change in time surcharges (night, evening, weekend, Christmas), leg by leg.
 * e.g. £100 quoted at 14:00 with a 10% night rate → £110 at 23:00, and back again.
 */
export function rescaleFareForSchedule(
  fare: number,
  journey: Pick<QuickQuoteJourney, "outboundDate" | "outboundTime" | "returnJourney" | "returnDate" | "returnTime">,
  next: QuickQuoteSchedule,
  rateFor: (date: string, time: string) => number,
): number {
  const legs = (s: { outboundDate: string; outboundTime: string; returnDate?: string; returnTime?: string }) => {
    const out = 1 + rateFor(s.outboundDate, s.outboundTime);
    if (!journey.returnJourney) return out;
    const ret = s.returnDate && s.returnTime ? 1 + rateFor(s.returnDate, s.returnTime) : 1;
    return out + ret;
  };
  const before = legs(journey);
  const after = legs(next);
  if (!(before > 0) || before === after) return Math.round(fare * 100) / 100;
  return Math.round(((fare * after) / before) * 100) / 100;
}

/**
 * Re-price a quote for a new pickup date/time: website-engine quotes re-run the engine
 * (live surcharges, route); owner-set fares are scaled by the surcharge change. Any
 * discount on the quote is kept. Returns the updated record (not yet saved).
 */
export async function rescheduleQuickQuote(
  record: QuickQuoteRecord,
  next: QuickQuoteSchedule,
  env: { TRACKING_STORE: KVNamespace; SITE_ORIGIN?: string; GOOGLE_PLACES_API_KEY?: string } & NonNullable<MainQuoteEnv>,
): Promise<{ ok: true; record: QuickQuoteRecord } | { ok: false; status: number; error: string }> {
  const j = record.journey;
  const nextJourney: QuickQuoteJourney = {
    ...j,
    outboundDate: next.outboundDate,
    outboundTime: next.outboundTime,
    ...(j.returnJourney ? { returnDate: next.returnDate, returnTime: next.returnTime } : {}),
  };
  let calculated: number | null = null;
  if (record.pricingSource === "website-pricing-engine") {
    const priced = await priceQuickQuoteBody(
      {
        ...nextJourney,
        journeyMode: j.returnJourney ? "return" : "one-way",
        priceSource: "website-pricing-engine",
        vehicleChoice: j.vehicleChoice ?? j.vehicleType,
      },
      env,
      { createdByOwner: false },
    );
    if (priced.ok) calculated = priced.pricing.discounted.calculatedFare;
  }
  if (calculated == null) {
    const pricing = await loadOwnerPricingOrDefault(env);
    const base =
      typeof record.calculatedAmount === "number" && Number.isFinite(record.calculatedAmount)
        ? quickQuoteCalculatedAmount(record)
        : quickQuoteTransferFareGbp(record);
    calculated = rescaleFareForSchedule(base, j, next, (date, time) =>
      tripSurchargeRate(date, time, pricing),
    );
  }
  const discounted = applyQuickQuoteManualDiscount(calculated, record.discountType ?? "none", record.discountValue ?? 0);
  const floor = assertQuickQuoteTransferFareFloor(discounted.customerFare);
  if (!floor.ok) return { ok: false, status: 422, error: floor.message };
  const expressFee =
    typeof j.expressDropOffFee === "number" && Number.isFinite(j.expressDropOffFee) ? Math.max(0, j.expressDropOffFee) : 0;
  const total = Math.round((discounted.customerFare + expressFee) * 100) / 100;
  return {
    ok: true,
    record: {
      ...record,
      journey: nextJourney,
      quotedAmount: total,
      quotedAmountLabel: formatQuickQuoteAmount(total),
      calculatedAmount: discounted.calculatedFare,
      calculatedAmountLabel: formatQuickQuoteAmount(discounted.calculatedFare),
      discountType: discounted.discountType,
      discountValue: discounted.discountValue,
      discountAmount: discounted.discountAmount,
      // Any unpaid SumUp session was for the old price.
      status: "open",
      checkoutId: undefined,
      checkoutReference: undefined,
      paymentUrl: undefined,
    },
  };
}

/** POST /quick-quotes/reschedule — the customer changed the date/time on a quote link. */
export async function handlePublicQuickQuoteReschedule(
  request: Request,
  env: { TRACKING_STORE?: KVNamespace; SITE_ORIGIN?: string; GOOGLE_PLACES_API_KEY?: string } & NonNullable<MainQuoteEnv>,
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Quote store is not configured" }, 503, origin);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400, origin);
  }
  const id = normalizeQuickQuoteId(String(body.id ?? ""));
  if (!id) return json({ error: "Missing quote id." }, 400, origin);
  const record = await getQuickQuote(store, id);
  if (!record) return json({ error: "This quote link is invalid or no longer available." }, 404, origin);
  if (record.status === "paid") return json({ error: "This quote has already been paid." }, 409, origin);
  if (isQuickQuoteExpired(record) || record.status === "expired" || record.status === "cancelled") {
    return json({ error: "This quote link has expired. Please contact My Airport Taxi NI for a new quote." }, 410, origin);
  }
  const next = parseQuickQuoteSchedule(body, Boolean(record.journey.returnJourney));
  if ("error" in next) return json({ error: next.error }, 400, origin);
  if (!quickQuoteScheduleChanged(record.journey, next)) {
    return json({ ok: true, quote: toQuickQuotePublicSummary(record) }, 200, origin);
  }
  if ((await consumeQuickQuoteCreateQuota(store, `reschedule:${id}`, 30)) === "limited") {
    return json({ error: "Too many changes to this quote. Please try again later." }, 429, origin);
  }
  const result = await rescheduleQuickQuote(record, next, { ...env, TRACKING_STORE: store });
  if (!result.ok) return json({ error: result.error }, result.status, origin);
  await saveQuickQuote(store, result.record);
  return json({ ok: true, quote: toQuickQuotePublicSummary(result.record) }, 200, origin);
}

export function isQuickQuotePath(pathname: string): boolean {
  return (
    pathname === "/quick-quotes/reschedule" ||
    pathname === "/api/quick-quotes/reschedule" ||
    pathname === "/owner/quick-quotes" ||
    pathname === "/api/owner/quick-quotes" ||
    pathname === "/quick-quotes/by-id" ||
    pathname === "/api/quick-quotes/by-id"
  );
}
