/**
 * Regression: Owner Personal Quotes "Calculate website price" must match the
 * public Live Quote for the SAME journey — including when the journey needs
 * `applyBelfastAirportDistanceFloor` (BFS/BHD long-distance floor) to price
 * correctly.
 *
 * Bug this guards against:
 *   Belfast International Airport (BFS) → 201 Ballynahinch Road,
 *   Hillsborough BT26 6BH
 *     Public Live Quote:        £65  (calculateQuote WITH route metrics)
 *     Owner Personal Quotes:    £55  (calculateQuote WITHOUT route metrics —
 *                                     zone-only fare, floor never evaluated)
 *
 * Root cause: `calculateQuote()` only runs `applyBelfastAirportDistanceFloor`
 * (and the >100km distance-protection override) inside its
 * `isValidRouteMetrics(routeMetrics)` guard (src/lib/quote.ts). Owner Personal
 * Quotes previously only fetched route metrics when BOTH addresses already
 * had confirmed lat/lng — but UK street addresses resolved via GetAddress.io /
 * Ideal Postcodes premises lookups (`ga:static:...` placeIds, see
 * shared/getaddress.ts / shared/ideal-postcodes.ts) are routinely selected
 * ("confirmed": placeId + formattedAddress) WITHOUT lat/lng. The public
 * QuoteCard/TripMap tolerated this via a geocoding fallback; Owner Personal
 * Quotes did not, so it silently priced with `routeMetrics = null`.
 *
 * Fix: `src/lib/route-point-resolver.ts` provides ONE coordinate-resolution
 * path (known lat/lng → served-airport catalogue → geocode fallback) used by
 * BOTH `TripMap.tsx` (public) and `OwnerPersonalQuotesPanel.tsx` (owner), so
 * both surfaces feed the SAME canonical `calculateQuote()` with equivalent
 * inputs.
 *
 * Run: npx tsx scripts/check-owner-personal-quote-fare-parity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const BFS_HILLSBOROUGH_ADDRESS = "201 Ballynahinch Road, Hillsborough BT26 6BH";
const milesToKm = (miles: number) => miles / 0.621371;

console.log("=== 1. Exact-bug fare split reproduced deterministically ===");
{
  // Owner-reported bug: zone-only fare (no route metrics) must be £55 —
  // this is the value Owner Personal Quotes showed before the fix.
  const zoneOnly = calculateQuote(
    BFS_HILLSBOROUGH_ADDRESS,
    "BFS",
    SALOON_VEHICLE,
    false,
    {},
    null,
  );
  assert.equal(zoneOnly?.amount, 55, "zone-only BFS→Hillsborough must be £55");
  assert.equal(zoneOnly?.area, "Hillsborough");
  assert.equal(zoneOnly?.areaSurcharge, 8);
  assert.equal(zoneOnly?.airportBase, 45);

  // Public-reported bug: with a real driving route (~22 miles — over the
  // 20-mile belfastAirportDistanceFloor threshold), the floor applies and
  // must raise the fare to £65 — this is the value the public site showed.
  const withRoute = calculateQuote(
    BFS_HILLSBOROUGH_ADDRESS,
    "BFS",
    SALOON_VEHICLE,
    false,
    {},
    { distanceKm: milesToKm(22.5), durationMinutes: 22.5 * 1.4 },
  );
  assert.equal(withRoute?.amount, 65, "BFS→Hillsborough with route metrics must be £65");

  assert.equal(
    (withRoute?.amount ?? 0) - (zoneOnly?.amount ?? 0),
    10,
    "the gap must be exactly the belfastAirportDistanceFloor uplift, not a different rule",
  );
  console.log(
    "OK  £55 (zone-only, no route metrics) vs £65 (with route metrics) — reproduces the exact reported gap",
  );
}

console.log("\n=== 2. Owner Personal Quotes uses the shared route resolver ===");
{
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(
    panel,
    /resolveTripRouteMetricsForAddresses/,
    "OwnerPersonalQuotesPanel must resolve route metrics via the shared resolver",
  );
  assert.doesNotMatch(
    panel,
    /typeof pickupPlace\.lat === "number" &&\s*typeof pickupPlace\.lng === "number"/,
    "must not silently require pre-existing lat/lng before fetching route metrics",
  );
  console.log("OK  OwnerPersonalQuotesPanel routes through the shared resolver");
}

console.log("\n=== 3. Public TripMap uses the SAME shared resolver ===");
{
  const tripMap = read("src/components/TripMap.tsx");
  assert.match(
    tripMap,
    /resolveRoutePoint/,
    "TripMap must use the shared route-point resolver (same fallback as Owner Personal Quotes)",
  );

  const resolver = read("src/lib/route-point-resolver.ts");
  assert.match(resolver, /export async function resolveRoutePoint/);
  assert.match(resolver, /export async function resolveTripRouteMetricsForAddresses/);
  // The resolver must fall back to geocoding when lat/lng are missing —
  // this is the exact gap that caused the £55 vs £65 mismatch.
  assert.match(resolver, /geocodePickupAddress/);
  console.log("OK  one shared resolver backs both the public and owner quote surfaces");
}

console.log("\n=== 4. \"Same Fare Test\" owner tool is an amendment regression check, NOT a pricing-parity test ===");
{
  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  assert.match(switcher, /Same Fare Test/);
  const dashboard = read("src/app/driver/DriverPageClient.tsx");
  assert.match(dashboard, /OwnerAmendmentTestPanel/);
  const handlers = read("workers/addresses/src/amendment-test-handlers.ts");
  assert.match(
    handlers,
    /same-fare Manage Booking amendment fixtures/i,
    "Same Fare Test seeds a fixture to prove amendments do not change the fare — it does not compare " +
      "the public engine against Owner Personal Quotes",
  );
  console.log(
    "OK  confirmed: \"Same Fare Test\" = amendment no-fare-change regression, not public-vs-owner parity",
  );
}

console.log("\n=== 5. Shared website-fare entry + multi-airport / A2A / schedule parity ===");
{
  // Direct calculateQuote path (public engine) for airport drop-off / pickup directions.
  const bfsDropoff = calculateQuote(
    BFS_HILLSBOROUGH_ADDRESS,
    "BFS",
    SALOON_VEHICLE,
    false,
    {},
    { distanceKm: milesToKm(22.5), durationMinutes: 31 },
  );
  assert.equal(bfsDropoff?.amount, 65);

  // BHD long-distance floor (≥20 miles) must also raise above short zone fare when metrics exist.
  const bhdShort = calculateQuote("Holywood", "BHD", SALOON_VEHICLE, false, {}, null);
  const bhdLong = calculateQuote(
    "Far address beyond twenty miles",
    "BHD",
    SALOON_VEHICLE,
    false,
    {},
    { distanceKm: milesToKm(25), durationMinutes: 35 },
  );
  assert.ok(bhdShort && bhdLong);
  assert.ok(
    (bhdLong.amount ?? 0) > (bhdShort.amount ?? 0),
    "BHD long-distance floor must raise fare above short zone when route metrics present",
  );

  // Dublin / LDY still price via the same calculateQuote engine (zone surcharges).
  const dub = calculateQuote("Belfast City Centre", "DUB", SALOON_VEHICLE, false, {}, null);
  const ldy = calculateQuote("Belfast City Centre", "LDY", SALOON_VEHICLE, false, {}, null);
  assert.ok(dub && dub.amount >= 100, "Dublin Belfast City Centre must remain a long-haul fare");
  assert.ok(ldy && ldy.amount >= 100, "LDY Belfast City Centre must remain a long-haul fare");

  // Weekday = weekend = Bank Holiday (premium rates are 0) — public engine source of truth.
  const weekday = calculateQuote(
    BFS_HILLSBOROUGH_ADDRESS,
    "BFS",
    SALOON_VEHICLE,
    false,
    { outboundDate: "2026-08-21", outboundTime: "10:00" },
    { distanceKm: milesToKm(22.5), durationMinutes: 31 },
  );
  const weekend = calculateQuote(
    BFS_HILLSBOROUGH_ADDRESS,
    "BFS",
    SALOON_VEHICLE,
    false,
    { outboundDate: "2026-08-22", outboundTime: "10:00" },
    { distanceKm: milesToKm(22.5), durationMinutes: 31 },
  );
  const bankHoliday = calculateQuote(
    BFS_HILLSBOROUGH_ADDRESS,
    "BFS",
    SALOON_VEHICLE,
    false,
    { outboundDate: "2026-07-12", outboundTime: "10:00" },
    { distanceKm: milesToKm(22.5), durationMinutes: 31 },
  );
  assert.equal(weekday?.amount, 65);
  assert.equal(weekend?.amount, weekday?.amount);
  assert.equal(bankHoliday?.amount, weekday?.amount);
  assert.equal(weekday?.premiumApplied, false);

  // Return: 5% discount on 2× one-way (rounded).
  const returnFare = calculateQuote(
    BFS_HILLSBOROUGH_ADDRESS,
    "BFS",
    SALOON_VEHICLE,
    true,
    {
      returnJourney: true,
      outboundDate: "2026-08-21",
      outboundTime: "10:00",
      returnDate: "2026-08-21",
      returnTime: "18:00",
    },
    { distanceKm: milesToKm(22.5), durationMinutes: 31 },
  );
  assert.equal(returnFare?.amount, 124, "return must apply 5% discount to 2× £65 → £124");

  // A2A / airport wrappers remain the shared entry used by Owner Personal Quotes.
  const websiteFareSrc = read("src/lib/website-fare.ts");
  assert.match(websiteFareSrc, /calculateQuote/);
  assert.match(websiteFareSrc, /calculatePointToPointQuote/);
  assert.match(websiteFareSrc, /calculateAirportToAirportQuote/);
  assert.match(websiteFareSrc, /returnJourney: false/);
  assert.match(
    read("src/components/OwnerPersonalQuotesPanel.tsx"),
    /calculateWebsiteOneWayFare/,
    "Owner Personal Quotes must call calculateWebsiteOneWayFare (shared public engine wrapper)",
  );

  // Public QuoteCard must still call calculateQuote / calculatePointToPointQuote directly
  // (same functions website-fare wraps) — never a separate legacy calculator.
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /calculateQuote\(/);
  assert.match(card, /calculatePointToPointQuote\(/);
  assert.doesNotMatch(card, /legacyQuote|oldPricing|ownerOnlyFare/i);

  console.log("OK  BFS/BHD/DUB/LDY + weekday/weekend/BH + return discount share one public engine");
}

console.log("\n=== 6. Mobile quote step scroll + WhatsApp + Owner refund guards remain intact ===");
{
  assert.match(read("src/lib/quote-step-nav-scroll.ts"), /scheduleMobileQuoteStepNavScroll/);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /pendingQuoteStepNavScrollRef/);
  assert.match(card, /navigateQuoteStep/);
  assert.match(card, /id="step2-travel-details"/);
  assert.match(card, /id="step3-customer-details"/);
  assert.match(read("src/components/Header.tsx"), /data-matni-whatsapp-quick|WhatsApp/);
  assert.doesNotMatch(read("src/components/WhatsAppButton.tsx"), /fixed bottom|position:\s*fixed/);
  assert.match(read("src/components/OwnerPaidBookingsPanel.tsx"), /close as refunded|Mark as refunded|external/i);
  assert.match(read("workers/addresses/src/refund-coordinator.ts"), /mark_external_refund/);
  console.log("OK  mobile step scroll, WhatsApp row, and external-refund closeout still wired");
}

console.log("\nAll owner personal quote fare-parity checks passed.");
