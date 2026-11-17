/**
 * Dublin Airport Fare Adjustment below zero lowers Dublin Airport journey
 * fares only (owner go-live 17 Nov 2026: Belfast city centre → Dublin Airport
 * Saloon just under £240 with -7%). Other airports and long trips unchanged.
 *
 * Run: tsx scripts/check-dublin-airport-lower-fares.ts
 */
import assert from "node:assert/strict";
import {
  defaultOwnerPricingSettings,
  dublinAirportJourneyFareGbp,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { calculateQuote } from "../src/lib/quote";

const SALOON = "Standard Saloon (1–4 passengers)" as const;
const CITY = "Belfast City Hall, Belfast BT1 5GS";

// Live Saloon tiers on 17 Nov 2026 (90 mi £240, 100 mi £249).
const LIVE_KNOTS: Array<[number, number]> = [
  [4, 30], [6, 30], [8, 30], [10, 35], [12, 38], [15, 60], [20, 68], [25, 78], [30, 89], [35, 99],
  [40, 110], [50, 132], [60, 162], [70, 188], [80, 208], [90, 240], [100, 249], [125, 290],
  [150, 320], [200, 410], [250, 500], [300, 590],
];

function settingsAt(rate: number): OwnerPricingSettings {
  const s = defaultOwnerPricingSettings();
  s.saloon.knots = LIVE_KNOTS.map(([miles, fareGbp]) => ({ miles, fareGbp }));
  s.dublinAirportFareAdjustment = { rate };
  return s;
}

function journeyFare(airport: "DUB" | "BFS", miles: number, rate: number): number {
  const q = calculateQuote(
    CITY,
    airport,
    SALOON,
    false,
    {},
    { distanceKm: miles / 0.621371, durationMinutes: 100 },
    false,
    settingsAt(rate),
  );
  assert.ok(q);
  return (q as { journeyFareGbp?: number; amount?: number }).journeyFareGbp ?? (q as { amount: number }).amount;
}

console.log("=== helper ===");
assert.equal(dublinAirportJourneyFareGbp(248, true, -0.07), 230.64);
assert.equal(dublinAirportJourneyFareGbp(248, true, 0), 248);
assert.equal(dublinAirportJourneyFareGbp(248, false, -0.07), 248, "non-Dublin unchanged");
assert.equal(dublinAirportJourneyFareGbp(248, true, -0.9), 124, "never more than 50% off");

console.log("=== Belfast city centre → Dublin Airport, 98.6 mi ===");
const before = journeyFare("DUB", 98.6, 0);
const after = journeyFare("DUB", 98.6, -0.07);
console.log({ before, after });
assert.ok(before >= 247 && before <= 249, `tier fare today ~£248 (got ${before})`);
// + £4 drive-to-pickup (city centre) + £4 M1 toll on the live site.
assert.ok(after + 4 + 4 < 240, `customer price just under £240 (got ${after + 8})`);
assert.ok(after + 4 + 4 >= 236, `not cut further than needed (got ${after + 8})`);

console.log("=== Belfast International unaffected ===");
assert.equal(journeyFare("BFS", 18, -0.07), journeyFare("BFS", 18, 0));

console.log("PASS");
