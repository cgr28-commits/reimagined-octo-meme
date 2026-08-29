/**
 * Belfast airport distance floor is RETIRED for live quotes.
 * Universal distance pricing replaces it.
 * Run: npx tsx scripts/check-belfast-airport-distance-floor.ts
 */
import assert from "node:assert/strict";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { applyBelfastAirportDistanceFloor, calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import {
  calculateUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
} from "../shared/universal-distance-pricing";

assert.equal(PRICING_CONFIG.belfastAirportDistanceFloor?.enabled, false);
assert.equal(PRICING_CONFIG.universalDistancePricing?.enabled, true);

// Helper remains a no-op when disabled.
assert.equal(applyBelfastAirportDistanceFloor(55, "BFS", 40), 55);

const miles = 29.4;
const metrics = {
  distanceKm: miles / 0.621371,
  durationMinutes: 45,
};
const quote = calculateQuote(
  "Ballymena BT42",
  "BHD",
  SALOON_VEHICLE,
  false,
  {},
  metrics,
  false,
);
assert.ok(quote);
assert.equal(quote.amount, calculateUniversalSaloonJourneyFareGbp(miles));
assert.equal(quote.journeyFareGbp, quote.amount);

// Old floor would have forced ~£100; universal must win instead.
assert.notEqual(quote.amount, 100);
assert.ok(quote.amount < 100, `expected universal mid fare, got £${quote.amount}`);

console.log(
  `OK  floor disabled; Ballymena→BHD @ ${miles} mi = £${quote.amount} (universal, not floor)`,
);
console.log(
  `OK  ${universalDrivingMilesFromKm(metrics.distanceKm).toFixed(1)} road miles on universal curve`,
);
