/**
 * Route metrics: prefer OSRM; when unreachable (Cloudflare Workers), estimate
 * from haversine × road factor so Belfast airport floors still apply.
 *
 * Run: npx tsx scripts/check-trip-route-fallback.ts
 */
import assert from "node:assert/strict";
import { fetchTripRouteMetrics } from "../src/lib/trip-route";
import { applyBelfastAirportDistanceFloor } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";

const KNOCK = { lat: 54.618214, lng: -5.8582652 };
const CITY_HALL = { lat: 54.5964, lng: -5.9301 };
const BFS = { lat: 54.6575, lng: -6.2158 };

async function withBlockedOsrm<T>(fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("OSRM blocked");
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function main() {
  const knockMetrics = await withBlockedOsrm(() =>
    fetchTripRouteMetrics(KNOCK.lat, KNOCK.lng, BFS.lat, BFS.lng),
  );
  assert.ok(knockMetrics, "Knocknagoney estimate must return metrics");
  const knockMiles = knockMetrics.distanceKm * 0.621371;
  assert.ok(knockMiles > 20, `Knocknagoney estimate must clear 20-mile gate (got ${knockMiles})`);
  assert.equal(
    applyBelfastAirportDistanceFloor(55, "BFS", knockMetrics.distanceKm),
    65,
    "Knocknagoney estimate must raise floor to £65",
  );

  const cityMetrics = await withBlockedOsrm(() =>
    fetchTripRouteMetrics(CITY_HALL.lat, CITY_HALL.lng, BFS.lat, BFS.lng),
  );
  assert.ok(cityMetrics, "City Hall estimate must return metrics");
  const cityMiles = cityMetrics.distanceKm * 0.621371;
  assert.ok(cityMiles <= 20, `City Hall estimate must stay ≤20 miles (got ${cityMiles})`);
  assert.equal(
    applyBelfastAirportDistanceFloor(55, "BFS", cityMetrics.distanceKm),
    55,
    "City Hall estimate must keep zone £55",
  );

  const priced = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: true,
    pickupAddress: "Belfast International Airport",
    dropoffAddress: "66 Knocknagoney Park, Belfast BT4 2PW",
    returnJourney: false,
    outboundDate: "2026-08-30",
    outboundTime: "12:37",
    passengers: 2,
    suitcases: 2,
    routeMetrics: knockMetrics,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(priced.ok, true);
  if (priced.ok) {
    assert.equal(priced.amount, 65);
  }

  // Live OSRM (when reachable) should still work and also clear the floor.
  const live = await fetchTripRouteMetrics(KNOCK.lat, KNOCK.lng, BFS.lat, BFS.lng);
  assert.ok(live, "Live OSRM (or fallback) must return metrics");
  assert.ok(live.distanceKm * 0.621371 > 20);

  console.log("OK  trip-route OSRM fallback + Knocknagoney £65 / City Hall £55");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
