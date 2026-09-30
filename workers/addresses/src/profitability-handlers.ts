import { corsHeaders } from "../shared/google-places";
import { getExpressDropOffFeeGbp } from "../shared/express-drop-off";
import { resolvePaymentAirportContextFromAddresses } from "../shared/open-website-payment-fares";
import { calculateAuthoritativeWebsiteQuote } from "../../../src/lib/quote-service";
import { calculateAirportToAirportQuote, formatQuote } from "../../../src/lib/quote";
import type { VehicleType } from "../../../src/lib/data";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
} from "../../../src/lib/vehicle-selection";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { loadOwnerPricingOrDefault } from "./owner-pricing-handlers";
import { resolveWorkerTripRouteMetrics } from "./resolve-route-metrics";
import { buildOwnerProfitabilityReport } from "./profitability";

export function isOwnerProfitabilityTestPath(pathname: string): boolean {
  return pathname === "/owner/profitability-test" || pathname === "/api/owner/profitability-test";
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

function vehicleFromChoice(value: unknown): VehicleType {
  const raw = String(value ?? "");
  if (/estate/i.test(raw)) return ESTATE_VEHICLE;
  if (/minibus/i.test(raw)) return MINIBUS_VEHICLE;
  return SALOON_VEHICLE;
}

function expressFeeForJourney(
  pickupAddress: string,
  dropoffAddress: string,
  returnJourney: boolean,
  selected: boolean,
): number {
  if (!selected) return 0;
  const ctx = resolvePaymentAirportContextFromAddresses(pickupAddress, dropoffAddress);
  if (!ctx.ok) return 0;
  const codes = ctx.context.isAirportToAirport
    ? [ctx.context.pickupAirportCode, ctx.context.dropoffAirportCode]
    : [ctx.context.airportCode];
  const perDirection = codes.reduce((sum, code) => sum + getExpressDropOffFeeGbp(code), 0);
  return returnJourney ? perDirection * 2 : perDirection;
}

export async function handleOwnerProfitabilityTestRequest(
  request: Request,
  env: DriverAuthEnv & {
    TRACKING_STORE?: KVNamespace;
    GOOGLE_PLACES_API_KEY?: string;
    GETADDRESS_API_KEY?: string;
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
    return json({ error: "Unauthorized — owner access required." }, 401, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const pickupAddress = String(body.pickupAddress ?? "").trim();
  const dropoffAddress = String(body.dropoffAddress ?? "").trim();
  if (!pickupAddress || !dropoffAddress) {
    return json({ error: "Pickup and destination are required." }, 400, origin);
  }

  const pickupLat = Number(body.pickupLat);
  const pickupLng = Number(body.pickupLng);
  const dropoffLat = Number(body.dropoffLat);
  const dropoffLng = Number(body.dropoffLng);
  const routeMetrics = await resolveWorkerTripRouteMetrics({
    pickupAddress,
    dropoffAddress,
    pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
    pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
    dropoffLat: Number.isFinite(dropoffLat) ? dropoffLat : null,
    dropoffLng: Number.isFinite(dropoffLng) ? dropoffLng : null,
    googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
    getAddressApiKey: env.GETADDRESS_API_KEY,
    trustClientCoordinates: true,
  });
  if (!routeMetrics) {
    return json(
      { error: "The road route could not be measured. Choose both addresses from suggestions." },
      422,
      origin,
    );
  }

  const returnJourney = body.returnJourney === true;
  const vehicleType = vehicleFromChoice(body.vehicleType);
  const passengers = vehicleType === MINIBUS_VEHICLE ? 5 : 2;
  const suitcases = vehicleType === ESTATE_VEHICLE ? 3 : vehicleType === MINIBUS_VEHICLE ? 2 : 1;
  const pricing = await loadOwnerPricingOrDefault(env);
  const addressAirport = resolvePaymentAirportContextFromAddresses(pickupAddress, dropoffAddress);
  const schedule = {
    outboundDate: String(body.outboundDate ?? ""),
    outboundTime: String(body.outboundTime ?? ""),
    returnDate: String(body.returnDate ?? "") || undefined,
    returnTime: String(body.returnTime ?? "") || undefined,
    returnJourney,
  };

  let existingAmount = 0;
  let journeyFareGbp = 0;
  let airportFixedCostsGbp = 0;
  let nightWeekendSurchargeGbp = 0;

  if (
    addressAirport.ok &&
    addressAirport.context.isAirportToAirport &&
    addressAirport.context.pickupAirportCode &&
    addressAirport.context.dropoffAirportCode
  ) {
    const a2a = calculateAirportToAirportQuote(
      addressAirport.context.pickupAirportCode,
      addressAirport.context.dropoffAirportCode,
      pickupAddress,
      dropoffAddress,
      vehicleType,
      returnJourney,
      schedule,
      routeMetrics,
      pricing,
    );
    if (!a2a) {
      return json({ error: "No existing fare could be calculated for that journey." }, 422, origin);
    }
    existingAmount = a2a.amount;
    journeyFareGbp = a2a.journeyFareGbp ?? a2a.amount;
    airportFixedCostsGbp = a2a.airportFixedCostsGbp ?? 0;
    nightWeekendSurchargeGbp = a2a.nightWeekendSurchargeGbp ?? 0;
  } else {
    const quote = calculateAuthoritativeWebsiteQuote({
      airportCode: addressAirport.ok ? addressAirport.context.airportCode : null,
      fromAirport: addressAirport.ok ? addressAirport.context.fromAirport : false,
      pickupAddress,
      dropoffAddress,
      returnJourney,
      outboundDate: schedule.outboundDate,
      outboundTime: schedule.outboundTime,
      returnDate: schedule.returnDate,
      returnTime: schedule.returnTime,
      passengers,
      suitcases,
      routeMetrics,
      vehicleType,
      pricing,
      ownerMode: true,
      maxPassengers: 7,
      enforceAirportPickupServiceArea: false,
    });
    if (!quote.ok) {
      return json({ error: quote.message }, 422, origin);
    }
    existingAmount = quote.amount;
    journeyFareGbp = quote.journeyFareGbp ?? quote.amount;
    airportFixedCostsGbp = quote.airportFixedCostsGbp ?? 0;
    nightWeekendSurchargeGbp = quote.nightWeekendSurchargeGbp ?? 0;
  }

  const expressFeeGbp = expressFeeForJourney(
    pickupAddress,
    dropoffAddress,
    returnJourney,
    body.expressSelected === true,
  );
  const report = await buildOwnerProfitabilityReport({
    pricing,
    vehicleType,
    routeMetrics,
    pickup: Number.isFinite(pickupLat) && Number.isFinite(pickupLng)
      ? { lat: pickupLat, lng: pickupLng }
      : null,
    dropoff: Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng)
      ? { lat: dropoffLat, lng: dropoffLng }
      : null,
    returnJourney,
    schedule,
    existing: {
      amountGbp: existingAmount,
      journeyFareGbp,
      airportFixedCostsGbp,
      nightWeekendSurchargeGbp,
    },
    expressFeeGbp,
  });

  return json(
    {
      ok: true,
      currency: "GBP",
      existingAmountLabel: formatQuote(report.existingCustomerFareGbp),
      finalAmountLabel: formatQuote(report.finalCustomerPriceGbp),
      report,
    },
    200,
    origin,
  );
}
