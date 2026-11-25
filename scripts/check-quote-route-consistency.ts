/**
 * Quote consistency: the public website quote and the saved quote (and so the
 * saved-quote email, held price and WhatsApp) must always agree. Saved quotes are
 * priced by the website's own quote tool, so they cannot drift from it.
 *
 * Regression: Dublin Airport T1 -> George Best Belfast City Airport, Saloon,
 * 1 passenger, 0 suitcases, one way, 28 Nov 2026 12:00 showed GBP 243 on the
 * website but GBP 249 in the saved-quote email (live log: saved_quote_held_price_mismatch,
 * quote tool 243 vs saved 249), which also blocked the WhatsApp send.
 *
 * No network: Google Places and OSRM are stubbed.
 */
import assert from "node:assert/strict";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { buildAuthoritativeSavedQuotePricing } from "../workers/addresses/src/saved-quote-handlers";

const PICKUP = "Dublin Airport Terminal 1, Dublin, Ireland";
const DROPOFF = "George Best Belfast City Airport, Airport Road, Belfast BT3 9JH";
const PICKUP_ID = "ChIJ_test_dub_t1";
const DROPOFF_ID = "ChIJ_test_bhd";
const POINTS: Record<string, { latitude: number; longitude: number }> = {
  [PICKUP_ID]: { latitude: 53.4264, longitude: -6.2499 },
  [DROPOFF_ID]: { latitude: 54.6181, longitude: -5.8725 },
};

/** Distance the OSRM stub returns. */
const SERVER_KM = 166;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://places.googleapis.com/v1/places/")) {
    const id = decodeURIComponent(url.split("/places/")[1].split("?")[0]);
    const location = POINTS[id];
    return location
      ? new Response(JSON.stringify({ id, location }), { status: 200 })
      : new Response("{}", { status: 404 });
  }
  if (url.includes("/route/v1/driving/")) {
    return new Response(
      JSON.stringify({ routes: [{ distance: SERVER_KM * 1000, duration: 119 * 60 }] }),
      { status: 200 },
    );
  }
  throw new Error(`Unexpected network call in test: ${url}`);
}) as typeof fetch;

async function websiteQuote(browserKm: number) {
  const response = await handleQuoteCalculateRequest(
    new Request("https://example.com/quote/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickupAddress: PICKUP,
        dropoffAddress: DROPOFF,
        pickupPlaceId: PICKUP_ID,
        dropoffPlaceId: DROPOFF_ID,
        pickupLat: POINTS[PICKUP_ID].latitude,
        pickupLng: POINTS[PICKUP_ID].longitude,
        dropoffLat: POINTS[DROPOFF_ID].latitude,
        dropoffLng: POINTS[DROPOFF_ID].longitude,
        returnJourney: false,
        passengers: 1,
        suitcases: 0,
        vehicleType: "Saloon",
        outboundDate: "2026-11-28",
        outboundTime: "12:00",
        // What the browser measured itself. Must NOT set the price.
        routeMetrics: { distanceKm: browserKm, durationMinutes: 115, source: "osrm" },
        quoteProtocol: "optional-terminal-access-v4",
      }),
    }),
    "https://example.com",
    { GOOGLE_PLACES_API_KEY: "test-key" },
  );
  const payload = (await response.json()) as Record<string, any>;
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}

async function savedQuoteTotal(pricing?: ReturnType<typeof defaultOwnerPricingSettings>) {
  const result = await buildAuthoritativeSavedQuotePricing({
    googlePlacesApiKey: "test-key",
    ...(pricing ? { pricing } : {}),
    env: { GOOGLE_PLACES_API_KEY: "test-key" },
    journey: {
      pickupLabel: PICKUP,
      dropoffLabel: DROPOFF,
      pickupPlaceId: PICKUP_ID,
      dropoffPlaceId: DROPOFF_ID,
      airportCode: "DUB",
      isAirportTrip: true,
      isFromAirport: true,
      tripDate: "2026-11-28",
      tripTime: "12:00",
      returnJourney: false,
      passengers: 1,
      suitcases: 0,
      vehicle: "Saloon",
    } as Parameters<typeof buildAuthoritativeSavedQuotePricing>[0]["journey"],
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.pricing.airportChargesGbp, 9, "airport charges must be the real GBP 9, not a subtraction (was 8.97)");
  return result.quote.amount;
}

async function main() {
  const saved = await savedQuoteTotal();

  const website = await websiteQuote(SERVER_KM);
  assert.equal(website.amount, saved, `website GBP ${website.amount} must equal saved quote GBP ${saved}`);

  // Even if the saved-quote engine's own settings drift from the website's (the live
  // failure mode), the saved quote follows the website quote tool.
  const drift = defaultOwnerPricingSettings();
  drift.saloonFormula = { enabled: true, startingChargeGbp: 500, ratePerMileGbp: 9, minimumFareGbp: 500 };
  const driftedSaved = await savedQuoteTotal(drift);
  assert.equal(driftedSaved, website.amount, "saved quote must follow the website quote tool, not its own engine");

  console.log(`PASS: DUB T1 -> BHD website = saved quote = GBP ${saved} even when the saved-quote engine's settings drift`);
}

main()
  .finally(() => {
    globalThis.fetch = realFetch;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
