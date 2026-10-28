import { getBookingSettings } from "./booking-settings-store";
import { VEHICLE_TYPES, type VehicleType } from "../../../src/lib/data";
import { getReturnJourneySavingGbp } from "../shared/website-fare-breakdown";
/**
 * Saved Quote HTTP handlers + hourly reminder processor.
 * Persistence: Cloudflare KV (TRACKING_STORE). Emails: existing worker-email stack.
 * The original fare is an audit snapshot; the normal booking flow recalculates it.
 */

import {
  buildSavedQuoteCustomerUrl,
  evaluateSavedQuoteAccess,
  formatSavedQuoteAmount,
  lockSavedQuotePricingFromServer,
  normalizeSavedQuoteToken,
  shouldSendFinalReminder,
  shouldSendFirstReminder,
  toSavedQuotePublicSummary,
  type SavedQuoteJourneySnapshot,
  type SavedQuotePricingSnapshot,
  type SavedQuoteRecord,
} from "../shared/saved-quote";
import {
  buildSavedQuoteFinalReminderEmail,
  buildSavedQuoteFirstReminderEmail,
  buildSavedQuoteInitialEmail,
} from "../shared/saved-quote-emails";
import { corsHeaders } from "../shared/google-places";
import {
  calculateAuthoritativeWebsiteQuote,
  type QuoteServiceAirportCode,
  type QuoteServiceResult,
} from "../../../src/lib/quote-service";
import {
  resolveWorkerTripRouteMetrics,
  resolveWorkerTripRouteMetricsForPayment,
} from "./resolve-route-metrics";
import { isPositioningChargeActive, resolvePositioningChargeGbp } from "./positioning-charge";
import type { ProfitabilitySettings } from "../../../src/lib/owner-profitability-settings";
import {
  clearSavedQuoteReminderClaim,
  createSavedQuote,
  getSavedQuoteByToken,
  listOpenSavedQuoteTokens,
  markSavedQuoteBooked,
  markSavedQuoteExpiredIfNeeded,
  patchSavedQuoteEmailTimestamps,
  tryClaimSavedQuoteReminder,
} from "./saved-quote-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";
import { isExecutiveVehicle } from "../shared/executive-vehicle";
import { ownerPricingEngineOptions, type OwnerPricingSettings } from "../shared/owner-pricing-config";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { parseTerminalAccessChoices, quoteAirportAccessCharges, quoteOptionalMeetGreet, defaultMeetGreetFees } from "../shared/meet-greet";
import { loadOwnerPricingOrDefault } from "./owner-pricing-handlers";
import { suppressSavedQuoteReminderForBookedJourney } from "./saved-quote-booking-match";

export type SavedQuoteEnv = WorkerEmailEnv & {
  TRACKING_STORE: KVNamespace;
  SITE_ORIGIN?: string;
  GOOGLE_PLACES_API_KEY?: string;
  GETADDRESS_API_KEY?: string;
};

const DEFAULT_SITE_ORIGIN = "https://www.myairporttaxini.co.uk";

function siteOrigin(env: SavedQuoteEnv): string {
  return (env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...corsHeaders(origin),
    },
  });
}

export function isSavedQuotesCreatePath(pathname: string): boolean {
  return pathname === "/saved-quotes" || pathname === "/api/saved-quotes";
}

export function isSavedQuotesLookupPath(pathname: string): boolean {
  return (
    pathname === "/saved-quotes/by-token" || pathname === "/api/saved-quotes/by-token"
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function asOptionalNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function parseJourney(raw: unknown): SavedQuoteJourneySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const pickupLabel = String(j.pickupLabel ?? j.pickupAddress ?? "").trim();
  const dropoffLabel = String(j.dropoffLabel ?? j.destinationAddress ?? "").trim();
  const tripDate = String(j.tripDate ?? j.pickupDate ?? "").trim();
  const tripTime = String(j.tripTime ?? j.pickupTime ?? "").trim();
  // Date/time are optional at save — booking/payment still require them.
  if (!pickupLabel || !dropoffLabel || pickupLabel.length > 500 || dropoffLabel.length > 500) return null;

  // Require explicit party selections — never invent 1 passenger / 0 bags.
  if (j.passengers == null || (j.suitcases == null && j.luggage == null)) {
    return null;
  }
  const passengersRaw = Math.floor(Number(j.passengers));
  const suitcasesRaw = Math.floor(Number(j.suitcases ?? j.luggage));
  if (!Number.isFinite(passengersRaw) || passengersRaw < 1) return null;
  if (!Number.isFinite(suitcasesRaw) || suitcasesRaw < 0) return null;
  const passengers = Math.min(16, passengersRaw);
  const suitcases = Math.min(20, suitcasesRaw);
  const childSeatsRaw = Number(j.childSeats);
  const childSeats =
    Number.isFinite(childSeatsRaw) && childSeatsRaw > 0
      ? Math.min(4, Math.floor(childSeatsRaw))
      : undefined;

  return {
    pickupLabel,
    dropoffLabel,
    pickupPlaceId: asOptionalString(j.pickupPlaceId),
    pickupPlaceName: asOptionalString(j.pickupPlaceName),
    pickupCountryCode: asOptionalString(j.pickupCountryCode),
    pickupPostalCode: asOptionalString(j.pickupPostalCode),
    pickupStreetNumber: asOptionalString(j.pickupStreetNumber),
    dropoffPlaceName: asOptionalString(j.dropoffPlaceName),
    dropoffCountryCode: asOptionalString(j.dropoffCountryCode),
    dropoffPostalCode: asOptionalString(j.dropoffPostalCode),
    dropoffStreetNumber: asOptionalString(j.dropoffStreetNumber),
    dropoffPlaceId: asOptionalString(j.dropoffPlaceId ?? j.destinationPlaceId),
    pickupLat: asOptionalNumber(j.pickupLat),
    pickupLng: asOptionalNumber(j.pickupLng),
    dropoffLat: asOptionalNumber(j.dropoffLat ?? j.destinationLat),
    dropoffLng: asOptionalNumber(j.dropoffLng ?? j.destinationLng),
    airportCode: asOptionalString(j.airportCode ?? j.selectedAirport),
    tripMode: asOptionalString(j.tripMode),
    tripDirection: asOptionalString(j.tripDirection ?? j.journeyDirection),
    isAirportTrip: Boolean(j.isAirportTrip ?? j.airportCode ?? j.selectedAirport),
    isFromAirport:
      typeof j.isFromAirport === "boolean"
        ? j.isFromAirport
        : String(j.tripDirection ?? j.journeyDirection ?? "").includes("from"),
    journeyType: asOptionalString(j.journeyType),
    optionalMeetGreetSelected: j.optionalMeetGreetSelected === true,
    terminalAccessChoices: parseTerminalAccessChoices(j.terminalAccessChoices),
    outboundAirportAccessChoice: j.outboundAirportAccessChoice === "express" ? "express" : j.outboundAirportAccessChoice === "meet-greet" ? "meet-greet" : "free",
    returnAirportAccessChoice: j.returnAirportAccessChoice === "express" ? "express" : j.returnAirportAccessChoice === "meet-greet" ? "meet-greet" : "free",
    tripDate,
    tripTime,
    returnJourney: Boolean(j.returnJourney),
    returnDate: asOptionalString(j.returnDate),
    returnTime: asOptionalString(j.returnTime),
    passengers,
    suitcases,
    childSeats,
    childSeatNotes: childSeats ? asOptionalString(j.childSeatNotes) : undefined,
    vehicle: String(j.vehicle ?? j.vehicleType ?? "Standard Saloon (1–4 passengers)").trim(),
    flightNumber: asOptionalString(j.flightNumber)?.toUpperCase(),
    returnFlightNumber: asOptionalString(j.returnFlightNumber)?.toUpperCase(),
    tripLabel: String(j.tripLabel ?? "Airport transfer").trim() || "Airport transfer",
    journeyDistance: asOptionalString(j.journeyDistance),
    journeyDuration: asOptionalString(j.journeyDuration),
  };
}

function parseAirportCode(value: unknown): QuoteServiceAirportCode | null {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "BFS" || code === "BHD" || code === "DUB" || code === "LDY") return code;
  return null;
}

/**
 * Build the original snapshot using the unchanged authoritative pricing engine.
 * Client-submitted amounts are audit-only and never become totalAmount.
 */
export async function buildAuthoritativeSavedQuotePricing(input: {
  journey: SavedQuoteJourneySnapshot;
  /** Optional client amount for audit/mismatch logging only. */
  clientSubmittedAmount?: number;
  clientPricingMeta?: Record<string, unknown>;
  googlePlacesApiKey?: string;
  getAddressApiKey?: string;
  pricing?: OwnerPricingSettings | null;
}): Promise<
  | { ok: true; pricing: SavedQuotePricingSnapshot; quote: Extract<QuoteServiceResult, { ok: true }> }
  | { ok: false; message: string; reason: string }
> {
  const journey = input.journey;
  const airportCode = parseAirportCode(journey.airportCode);
  const isAirportTrip = Boolean(airportCode || journey.isAirportTrip);

  const ownerProfitability =
    input.pricing && "profitability" in input.pricing
      ? (input.pricing as { profitability?: ProfitabilitySettings | null }).profitability
      : null;
  // The drive-to-pickup charge needs server-resolved coordinates, so use the
  // payment resolver (the same one checkout re-quotes with) while it is ON.
  const paymentRoute = isPositioningChargeActive(ownerProfitability)
    ? await resolveWorkerTripRouteMetricsForPayment({
        pickupAddress: journey.pickupLabel,
        dropoffAddress: journey.dropoffLabel,
        pickupPlaceId: journey.pickupPlaceId,
        dropoffPlaceId: journey.dropoffPlaceId,
        googlePlacesApiKey: input.googlePlacesApiKey,
        getAddressApiKey: input.getAddressApiKey,
      })
    : null;
  const routeMetrics = paymentRoute
    ? paymentRoute.ok
      ? paymentRoute.metrics
      : null
    : await resolveWorkerTripRouteMetrics({
        pickupAddress: journey.pickupLabel,
        dropoffAddress: journey.dropoffLabel,
        pickupPlaceId: journey.pickupPlaceId,
        dropoffPlaceId: journey.dropoffPlaceId,
        trustClientCoordinates: false,
        getAddressApiKey: input.getAddressApiKey,
        pickupLat: journey.pickupLat,
        pickupLng: journey.pickupLng,
        dropoffLat: journey.dropoffLat,
        dropoffLng: journey.dropoffLng,
        googlePlacesApiKey: input.googlePlacesApiKey,
      });
  const positioning = await resolvePositioningChargeGbp({
    settings: ownerProfitability,
    airportTransfer: isAirportTrip && Boolean(airportCode),
    addressToAddress: !isAirportTrip,
    fromAirport: Boolean(journey.isFromAirport),
    pickup: paymentRoute?.ok ? paymentRoute.pickup : null,
    dropoff: paymentRoute?.ok ? paymentRoute.dropoff : null,
  });

  const quote = calculateAuthoritativeWebsiteQuote({
    positioningChargeGbp: positioning.chargeGbp,
    airportCode: isAirportTrip ? airportCode : null,
    fromAirport: Boolean(journey.isFromAirport),
    pickupAddress: journey.pickupLabel,
    dropoffAddress: journey.dropoffLabel,
    returnJourney: Boolean(journey.returnJourney),
    outboundDate: journey.tripDate,
    outboundTime: journey.tripTime,
    returnDate: journey.returnDate,
    returnTime: journey.returnTime,
    passengers: journey.passengers,
    suitcases: journey.suitcases,
    routeMetrics,
    vehicleType: (VEHICLE_TYPES as readonly string[]).includes(journey.vehicle) ? journey.vehicle as VehicleType : undefined,
    pricing: input.pricing,
  });

  if (!quote.ok) {
    return { ok: false, message: quote.message, reason: quote.reason };
  }

  let serverAmount = quote.amount;
  {
    const options = ownerPricingEngineOptions(input.pricing);
    const express = resolveExpressDropOff({
      airportCode: airportCode ?? null,
      fromAirport: Boolean(journey.isFromAirport),
      returnJourney: Boolean(journey.returnJourney),
      selected: true,
      outboundSelected: true,
      returnSelected: true,
    });
    const access = quoteAirportAccessCharges({
      expressLegs: express.legs,
      airportCode: airportCode ?? null,
      fromAirport: Boolean(journey.isFromAirport),
      returnJourney: Boolean(journey.returnJourney),
      fees: input.pricing?.meetGreet ?? defaultMeetGreetFees(),
      meetGreetIncluded: isExecutiveVehicle(quote.vehicleType),
      terminalAccessFees: input.pricing?.terminalAccess,
      visitChoices: journey.terminalAccessChoices,
      outboundChoice: journey.optionalMeetGreetSelected && airportCode !== "DUB" ? "meet-greet" : journey.outboundAirportAccessChoice,
      returnChoice: journey.returnAirportAccessChoice,
    });
    serverAmount = composeWebsiteFareBreakdown({
      preserveFixedFarePence: quote.preserveBfsMinimumPence === true,
      journeyFareBeforeAirportAccessGbp: quote.journeyFareGbp ?? quote.amount,
      airportFixedCostsGbp: quote.airportFixedCostsGbp ?? 0,
      nightWeekendSurchargeGbp: quote.nightWeekendSurchargeGbp ?? 0,
      airportAccessChargeGbp: access.airportAccessChargeGbp,
      outboundAirportAccessChargeGbp: access.outboundAirportAccessChargeGbp,
      returnAirportAccessChargeGbp: access.returnAirportAccessChargeGbp,
      returnJourney: quote.returnJourney,
      businessClassMinimumFareGbp: isExecutiveVehicle(quote.vehicleType) ? options.executiveMinimumFareGbp : undefined,
      outboundOneWayBeforeAccessGbp: quote.outboundOneWayBeforeAccessGbp,
      returnOneWayBeforeAccessGbp: quote.returnOneWayBeforeAccessGbp,
      returnDiscountRate: options.returnDiscountRate,
    }).finalAmountPayableGbp;
  }

  const optionalMeetGreet = quoteOptionalMeetGreet({
    selected: journey.optionalMeetGreetSelected === true,
    pickupAirportCode: journey.isFromAirport ? airportCode : null,
    fees: input.pricing?.meetGreet ?? defaultMeetGreetFees(),
    included: isExecutiveVehicle(quote.vehicleType),
  });
  if (!optionalMeetGreet.ok) return { ok: false, message: optionalMeetGreet.error, reason: "invalid_meet_greet" };
  serverAmount = Math.round((serverAmount + (airportCode === "DUB" ? optionalMeetGreet.feeGbp : 0)) * 100) / 100;
  const pricing = lockSavedQuotePricingFromServer({
    serverAmount,
    amountLabel: formatSavedQuoteAmount(serverAmount),
    clientSubmittedAmount: input.clientSubmittedAmount,
    pricingMeta: {
      source: quote.source,
      vehicleType: quote.vehicleType,
      premiumApplied: quote.premiumApplied,
      returnJourney: quote.returnJourney,
      ...(input.clientPricingMeta ? { clientPricingMeta: input.clientPricingMeta } : {}),
    },
  });

  pricing.airportChargesGbp = Math.round((serverAmount - quote.amount + (quote.airportFixedCostsGbp ?? 0)) * 100) / 100;
  pricing.returnSavingGbp = journey.returnJourney ? getReturnJourneySavingGbp(
    Math.max(0, (quote.journeyFareGbp ?? quote.amount) - (quote.nightWeekendSurchargeGbp ?? 0)),
    ownerPricingEngineOptions(input.pricing).returnDiscountRate,
  ) : 0;
  return { ok: true, pricing, quote };
}

function readClientSubmittedAmount(body: Record<string, unknown>): {
  amount?: number;
  meta?: Record<string, unknown>;
} {
  const pricingRaw = body.pricing;
  if (pricingRaw && typeof pricingRaw === "object") {
    const p = pricingRaw as Record<string, unknown>;
    const amount = Number(p.totalAmount ?? p.totalPrice ?? p.amount);
    const meta =
      p.pricingMeta && typeof p.pricingMeta === "object"
        ? (p.pricingMeta as Record<string, unknown>)
        : undefined;
    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      meta,
    };
  }
  const amount = Number(body.totalAmount ?? body.amount);
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
  };
}

/** POST /saved-quotes — create + send initial email. */
export async function handleCreateSavedQuote(
  request: Request,
  env: SavedQuoteEnv,
  origin: string | null,
): Promise<Response> {
  if (!env.TRACKING_STORE) {
    return jsonResponse({ error: "Quote store is not configured." }, 503, origin);
  }

  const settings = (await getBookingSettings(env.TRACKING_STORE)).saveQuote;
  if (!settings.enabled) return jsonResponse({ error: "Saving quotes is currently unavailable." }, 403, origin);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return jsonResponse({ error: "Request too large." }, 413, origin);
    body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  const channel = body.channel === "whatsapp" ? "whatsapp" : "email";
  if ((channel === "email" && !settings.emailEnabled) || (channel === "whatsapp" && !settings.whatsappEnabled)) {
    return jsonResponse({ error: "This saving option is currently unavailable." }, 403, origin);
  }
  const customerName = String(body.customerName ?? "").trim().slice(0, 100);
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  if (channel === "email" && (!isValidEmail(customerEmail) || customerEmail.length > 254)) {
    return jsonResponse({ error: "Please enter a valid email address." }, 400, origin);
  }
  if (!await allowSavedQuoteRequest(env.TRACKING_STORE, request, channel === "email" ? customerEmail : undefined)) {
    return jsonResponse({ error: "Too many requests. Please try again later." }, 429, origin);
  }

  const journeyBase = parseJourney(body.journey);
  if (!journeyBase) {
    return jsonResponse(
      { error: "Pickup and destination are required to save a quote." },
      400,
      origin,
    );
  }

  // Never trust client pricing — recalculate with the same engine as Quick Quote / QuoteCard.
  const clientPrice = readClientSubmittedAmount(body);
  const ownerPricing = await loadOwnerPricingOrDefault(env);
  const priced = await buildAuthoritativeSavedQuotePricing({
    journey: journeyBase,
    clientSubmittedAmount: clientPrice.amount,
    clientPricingMeta: clientPrice.meta,
    googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
    getAddressApiKey: env.GETADDRESS_API_KEY,
    pricing: ownerPricing,
  });
  if (!priced.ok) {
    return jsonResponse(
      {
        error: priced.message,
        reason: priced.reason,
      },
      422,
      origin,
    );
  }

  const pricing = priced.pricing;
  const journey: SavedQuoteJourneySnapshot = {
    ...journeyBase,
    ...(priced.quote.vehicleType ? { vehicle: priced.quote.vehicleType } : {}),
  };

  let record: SavedQuoteRecord;
  try {
    record = await createSavedQuote(env.TRACKING_STORE, {
      customerName,
      customerEmail: channel === "email" ? customerEmail : "",
      validityDays: settings.validityDays,
      journey,
      pricing,
    });
  } catch (err) {
    console.error("[saved-quote] create failed", err);
    return jsonResponse({ error: "Could not save your quote. Please try again." }, 500, origin);
  }

  console.log(
    JSON.stringify({
      event: "saved_quote_created",
      reference: record.reference,
      amount: record.pricing.totalAmount,
      clientSubmittedAmount: record.pricing.clientSubmittedAmount ?? null,
      mismatch: Boolean(
        record.pricing.pricingMeta &&
          (record.pricing.pricingMeta as { clientAmountMismatch?: boolean }).clientAmountMismatch,
      ),
    }),
  );

  const email = buildSavedQuoteInitialEmail(record, { origin: siteOrigin(env) });
  let emailSent = false;
  let emailError: string | undefined;
  try {
    if (channel === "email") {
    const result = await trySendBrandedCustomerEmail(env, {
      to: customerEmail,
      toName: customerName,
      subject: email.subject,
      body: email.text,
      htmlBody: email.html,
    });
    if (result.sent) {
      emailSent = true;
      await patchSavedQuoteEmailTimestamps(env.TRACKING_STORE, record.token, {
        initialEmailSentAt: new Date().toISOString(),
        lastEmailError: undefined,
      });
      record = {
        ...record,
        initialEmailSentAt: new Date().toISOString(),
        lastEmailError: undefined,
      };
    } else {
      emailError = result.error || "Email send failed";
      await patchSavedQuoteEmailTimestamps(env.TRACKING_STORE, record.token, {
        lastEmailError: emailError,
      });
      console.error("[saved-quote] initial email failed", {
        reference: record.reference,
        error: emailError,
      });
    }
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    await patchSavedQuoteEmailTimestamps(env.TRACKING_STORE, record.token, {
      lastEmailError: emailError,
    });
    console.error("[saved-quote] initial email exception", {
      reference: record.reference,
      error: emailError,
    });
  }

  const summary = toSavedQuotePublicSummary(record, siteOrigin(env));
  return jsonResponse(
    {
      ok: true,
      token: record.token,
      reference: record.reference,
      expiresAt: record.expiresAt,
      expiresAtLabel: summary.expiresAtLabel,
      amount: summary.amount,
      amountLabel: summary.amountLabel,
      currency: "GBP",
      email: customerEmail,
      emailSent,
      emailError: !emailSent && channel === "email" ? "Email could not be sent. Use your secure link below." : undefined,
      quoteUrl: summary.bookUrl,
      quote: summary,
    },
    200,
    origin,
  );
}

/** GET /saved-quotes/by-token?t= — public lookup. */
export async function handleGetSavedQuote(
  request: Request,
  env: SavedQuoteEnv,
  origin: string | null,
): Promise<Response> {
  if (!env.TRACKING_STORE) {
    return jsonResponse({ error: "Quote store is not configured." }, 503, origin);
  }

  if (!await allowSavedQuoteRequest(env.TRACKING_STORE, request, undefined, true)) {
    return jsonResponse({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  const url = new URL(request.url);
  const token = normalizeSavedQuoteToken(url.searchParams.get("t") || url.searchParams.get("token") || "");
  if (!token || token.length < 32) {
    return jsonResponse({ error: "Quote not found." }, 404, origin);
  }

  let record = await getSavedQuoteByToken(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Quote not found." }, 404, origin);
  }

  record = await markSavedQuoteExpiredIfNeeded(env.TRACKING_STORE, record);
  const access = evaluateSavedQuoteAccess(record);
  const summary = toSavedQuotePublicSummary(record, siteOrigin(env));

  if (!access.ok) {
    return jsonResponse(
      {
        ok: false,
        error: access.error,
        canBook: false,
        message:
          access.error === "booked"
            ? "This journey has already been booked."
            : access.error === "expired"
              ? "This quote has expired."
              : "Quote not found.",
      },
      access.error === "not_found" ? 404 : 409,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      quote: summary,
      canBook: true,
    },
    200,
    origin,
  );
}

/**
 * Validate saved-quote access. Payment callers must recalculate before charging.
 */
export async function resolveSavedQuoteForPayment(
  store: KVNamespace,
  tokenRaw: string,
): Promise<
  | { ok: true; record: SavedQuoteRecord; amount: number }
  | { ok: false; error: string; status: number }
> {
  const token = normalizeSavedQuoteToken(tokenRaw);
  if (!token || token.length < 32) {
    return { ok: false, error: "This saved quote link is invalid.", status: 404 };
  }
  let record = await getSavedQuoteByToken(store, token);
  if (!record) {
    return { ok: false, error: "This saved quote link is invalid or no longer available.", status: 404 };
  }
  record = await markSavedQuoteExpiredIfNeeded(store, record);
  const access = evaluateSavedQuoteAccess(record);
  if (!access.ok) {
    if (access.error === "booked") {
      return {
        ok: false,
        error: "This journey has already been booked.",
        status: 409,
      };
    }
    if (access.error === "expired") {
      return {
        ok: false,
        error:
          "This saved quote has expired. Please get a new quote to see the current price.",
        status: 410,
      };
    }
    return { ok: false, error: "This saved quote is no longer available.", status: 404 };
  }
  const amount = Math.round(record.pricing.totalAmount * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, error: "This saved quote has an invalid price.", status: 422 };
  }
  return { ok: true, record, amount };
}

export async function markSavedQuoteBookedFromPayment(
  store: KVNamespace,
  token: string,
  meta: { paymentReference: string; checkoutId?: string },
): Promise<SavedQuoteRecord | null> {
  return markSavedQuoteBooked(store, token, meta);
}

/**
 * Hourly cron: 24h + day-5 reminders; expire open quotes.
 * Re-checks status before every send. Claim-before-send narrows KV races
 * (same best-effort pattern as personal-quote reservations — KV has no true CAS).
 */
export async function processSavedQuoteReminders(env: SavedQuoteEnv): Promise<{
  processed: number;
  firstReminders: number;
  finalReminders: number;
  expired: number;
  skipped: number;
  errors: number;
}> {
  if (!env.TRACKING_STORE) {
    return { processed: 0, firstReminders: 0, finalReminders: 0, expired: 0, skipped: 0, errors: 0 };
  }

  const store = env.TRACKING_STORE;
  const tokens = await listOpenSavedQuoteTokens(store);
  const now = new Date();
  let firstReminders = 0;
  let finalReminders = 0;
  let expired = 0;
  let skipped = 0;
  let errors = 0;
  const origin = siteOrigin(env);

  for (const token of tokens) {
    try {
      let record = await getSavedQuoteByToken(store, token);
      if (!record) {
        skipped += 1;
        continue;
      }

      if (record.status === "booked") {
        skipped += 1;
        continue;
      }

      record = await markSavedQuoteExpiredIfNeeded(store, record, now);
      if (record.status === "expired") {
        expired += 1;
        continue;
      }

      if (record.status !== "saved") {
        skipped += 1;
        continue;
      }

      if (shouldSendFirstReminder(record, now)) {
        const claim = await tryClaimSavedQuoteReminder(store, token, "first");
        if (!claim.ok) {
          skipped += 1;
          continue;
        }
        // Re-check due window after claim (status may have changed).
        if (!shouldSendFirstReminder(claim.record, now) || claim.record.status !== "saved") {
          await clearSavedQuoteReminderClaim(store, token, "first", claim.claimId);
          skipped += 1;
          continue;
        }
        if (await suppressSavedQuoteReminderForBookedJourney(store, claim.record)) {
          await clearSavedQuoteReminderClaim(store, token, "first", claim.claimId);
          skipped += 1;
          continue;
        }
        const email = buildSavedQuoteFirstReminderEmail(claim.record, { origin });
        const result = await trySendBrandedCustomerEmail(env, {
          to: claim.record.customerEmail,
          toName: claim.record.customerName,
          subject: email.subject,
          body: email.text,
          htmlBody: email.html,
        });
        if (result.sent) {
          await patchSavedQuoteEmailTimestamps(store, token, {
            firstReminderSentAt: new Date().toISOString(),
            lastEmailError: undefined,
          });
          firstReminders += 1;
        } else {
          await clearSavedQuoteReminderClaim(store, token, "first", claim.claimId);
          await patchSavedQuoteEmailTimestamps(store, token, {
            lastEmailError: result.error || "First reminder failed",
          });
          console.error("[saved-quote] first reminder failed", {
            reference: claim.record.reference,
            error: result.error,
          });
          errors += 1;
        }
        continue;
      }

      if (shouldSendFinalReminder(record, now)) {
        const claim = await tryClaimSavedQuoteReminder(store, token, "final");
        if (!claim.ok) {
          skipped += 1;
          continue;
        }
        if (!shouldSendFinalReminder(claim.record, now) || claim.record.status !== "saved") {
          await clearSavedQuoteReminderClaim(store, token, "final", claim.claimId);
          skipped += 1;
          continue;
        }
        if (await suppressSavedQuoteReminderForBookedJourney(store, claim.record)) {
          await clearSavedQuoteReminderClaim(store, token, "final", claim.claimId);
          skipped += 1;
          continue;
        }
        const email = buildSavedQuoteFinalReminderEmail(claim.record, { origin });
        const result = await trySendBrandedCustomerEmail(env, {
          to: claim.record.customerEmail,
          toName: claim.record.customerName,
          subject: email.subject,
          body: email.text,
          htmlBody: email.html,
        });
        if (result.sent) {
          await patchSavedQuoteEmailTimestamps(store, token, {
            finalReminderSentAt: new Date().toISOString(),
            lastEmailError: undefined,
          });
          finalReminders += 1;
        } else {
          await clearSavedQuoteReminderClaim(store, token, "final", claim.claimId);
          await patchSavedQuoteEmailTimestamps(store, token, {
            lastEmailError: result.error || "Final reminder failed",
          });
          console.error("[saved-quote] final reminder failed", {
            reference: claim.record.reference,
            error: result.error,
          });
          errors += 1;
        }
        continue;
      }

      skipped += 1;
    } catch (err) {
      errors += 1;
      console.error("[saved-quote] reminder processor error", {
        token: token.slice(0, 8),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    processed: tokens.length,
    firstReminders,
    finalReminders,
    expired,
    skipped,
    errors,
  };
}

export { getSavedQuoteByToken, buildSavedQuoteCustomerUrl };

/** KV limits are best-effort across regions; isolate counters also stop local bursts. */
const localLimits = new Map<string, { count: number; until: number }>();
export async function allowSavedQuoteRequest(store: KVNamespace, request: Request, email?: string, readOnly = false): Promise<boolean> {
  const hour = Math.floor(Date.now() / 3600000);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const buckets: Array<[string, number]> = [[`ip:${ip}:${readOnly ? "read" : "create"}`, readOnly ? 120 : 10]];
  if (email) buckets.push([`email:${email}`, 3]);
  for (const [identity, max] of buckets) {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)))).map(b => b.toString(16).padStart(2,"0")).join("");
    const key = `saved-quote:limit:${hour}:${hash}`;
    const local = localLimits.get(key);
    if (local && local.until > Date.now() && local.count >= max) return false;
    const count = Math.max(Number(await store.get(key)) || 0, local?.count || 0);
    if (count >= max) return false;
    if (localLimits.size > 10000) for (const [k,v] of localLimits) if (v.until <= Date.now()) localLimits.delete(k);
    localLimits.set(key, { count: count + 1, until: (hour + 1) * 3600000 });
    await store.put(key, String(count + 1), { expirationTtl: 3600 });
  }
  return true;
}
