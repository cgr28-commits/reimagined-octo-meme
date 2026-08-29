/**
 * Route metrics: commercial fares require OSRM road routing.
 * Haversine × 1.48 may be used for display only — never for pricing.
 *
 * Run: npx tsx scripts/check-trip-route-fallback.ts
 */
import assert from "node:assert/strict";
import {
  estimateTripRouteMetrics,
  fetchRoadTripRouteMetrics,
  fetchTripRouteMetrics,
  isRoadRouteMetrics,
} from "../src/lib/trip-route";
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
  // Display-only estimate still exists and can raise the floor mathematically —
  // but must never be accepted as road metrics for commercial pricing.
  const knockEstimate = estimateTripRouteMetrics(KNOCK.lat, KNOCK.lng, BFS.lat, BFS.lng);
  assert.ok(knockEstimate, "Knocknagoney estimate must return metrics");
  assert.equal(knockEstimate.source, "estimate");
  assert.equal(isRoadRouteMetrics(knockEstimate), false);
  const knockMiles = knockEstimate.distanceKm * 0.621371;
  assert.ok(knockMiles > 20, `Knocknagoney estimate clears 20-mile gate (got ${knockMiles})`);

  const blockedRoad = await withBlockedOsrm(() =>
    fetchRoadTripRouteMetrics(KNOCK.lat, KNOCK.lng, BFS.lat, BFS.lng),
  );
  assert.equal(blockedRoad, null, "Road metrics must be null when OSRM is blocked");

  const blockedDefault = await withBlockedOsrm(() =>
    fetchTripRouteMetrics(KNOCK.lat, KNOCK.lng, BFS.lat, BFS.lng),
  );
  assert.equal(blockedDefault, null, "Default fetch must not silently fall back to haversine");

  const blockedDisplay = await withBlockedOsrm(() =>
    fetchTripRouteMetrics(KNOCK.lat, KNOCK.lng, BFS.lat, BFS.lng, {
      allowEstimateFallback: true,
    }),
  );
  assert.ok(blockedDisplay);
  assert.equal(blockedDisplay?.source, "estimate");

  // Authoritative quote with estimate metrics is a programming error path —
  // callers must not pass estimates. If they do with valid shape, engine still
  // prices (legacy); Worker/TripMap must refuse to supply estimates.
  const pricedFromEstimate = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: true,
    pickupAddress: "Belfast International Airport",
    dropoffAddress: "66 Knocknagoney Park, Belfast BT4 2PW",
    returnJourney: false,
    outboundDate: "2026-08-30",
    outboundTime: "12:37",
    passengers: 2,
    suitcases: 2,
    routeMetrics: knockEstimate,
    vehicleType: SALOON_VEHICLE,
  });
  // Engine still accepts TripRouteMetrics shape; gate is at fetch/Worker layer.
  assert.equal(pricedFromEstimate.ok, true);

  const cityEstimate = estimateTripRouteMetrics(
    CITY_HALL.lat,
    CITY_HALL.lng,
    BFS.lat,
    BFS.lng,
  );
  assert.ok(cityEstimate);
  const cityMiles = cityEstimate.distanceKm * 0.621371;
  assert.ok(cityMiles <= 20, `City Hall estimate must stay ≤20 miles (got ${cityMiles})`);
  assert.equal(
    applyBelfastAirportDistanceFloor(55, "BFS", cityEstimate.distanceKm),
    55,
    "City Hall estimate must keep zone £55 when used only as math check",
  );

  // Live OSRM (when reachable) is the commercial path.
  const live = await fetchRoadTripRouteMetrics(KNOCK.lat, KNOCK.lng, BFS.lat, BFS.lng);
  if (live) {
    assert.equal(live.source, "osrm");
    assert.equal(isRoadRouteMetrics(live), true);
    assert.ok(live.distanceKm * 0.621371 > 0);
    console.log("OK  live OSRM road metrics available");
  } else {
    console.log("OK  live OSRM unreachable in this environment (expected in some CI)");
  }

  // Source assertions: commercial helpers never promote estimates.
  assert.equal(isRoadRouteMetrics({ distanceKm: 20, durationMinutes: 30, source: "estimate" }), false);
  assert.equal(isRoadRouteMetrics({ distanceKm: 20, durationMinutes: 30, source: "osrm" }), true);

  console.log("OK  haversine is display-only; commercial fetch requires OSRM");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
