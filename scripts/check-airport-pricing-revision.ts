/**
 * Airport pricing revision checks (PR #435 universal distance live behaviour).
 * Config may retain historical BHD £34 / BFS £45 / estate tiers — those are
 * RETIRED for live quotes. Live path: road miles → Saloon curve; Estate +£6.
 *
 * Run: npx tsx scripts/check-airport-pricing-revision.ts
 */

import assert from "node:assert/strict";

import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  AIRPORT_OTS_UNDERCUT_MAX,
  AIRPORT_OTS_UNDERCUT_MIN,
  applyBelfastAirportDistanceFloor,
  calculatePointToPointQuote,
  calculateQuote,
  getAirportEstatePremiumGbp,
} from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
} from "../src/lib/vehicle-selection";
import {
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
} from "../shared/universal-distance-pricing";

const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;
const MINIBUS = MINIBUS_VEHICLE;

const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const holywood = "22 High Street, Holywood, BT18 9AB";

function metricsForMiles(miles: number, durationMinutes = 40) {
  return { distanceKm: miles / 0.621371, durationMinutes };
}

// Live universal config
assert.equal(PRICING_CONFIG.universalDistancePricing?.enabled, true);
assert.equal(PRICING_CONFIG.universalDistancePricing?.estatePremiumGbp, 6);
assert.equal(PRICING_CONFIG.belfastAirportDistanceFloor?.enabled, false);
console.log("OK  universalDistancePricing enabled; estatePremiumGbp £6; Belfast floor disabled");

// Historical config numbers retained (not used for live quotes)
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.LDY, 35);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.LDY, 35);
console.log("OK  Historical airport base/minimum config retained (retired for live quotes)");

assert.equal(AIRPORT_OTS_UNDERCUT_MIN, 3);
assert.equal(AIRPORT_OTS_UNDERCUT_MAX, 5);
assert.equal(PRICING_CONFIG.otsReferenceModel.undercutMinGbp, 8);
assert.equal(PRICING_CONFIG.otsReferenceModel.undercutMaxGbp, 10);
console.log("OK  Airport OTS calibration £3–£5; A2A reference undercut still £8–£10");

// Live estate premium is always £6 when universal enabled (tiers retired)
assert.equal(getAirportEstatePremiumGbp("BFS", 34), 6);
assert.equal(getAirportEstatePremiumGbp("BFS", 45), 6);
assert.equal(getAirportEstatePremiumGbp("BFS", 46), 6);
assert.equal(getAirportEstatePremiumGbp("BFS", 139), 6);
assert.equal(getAirportEstatePremiumGbp("BFS", 140), 6);
assert.equal(getAirportEstatePremiumGbp("BHD", 45), 6);
assert.equal(getAirportEstatePremiumGbp("BHD", 140), 6);
assert.equal(getAirportEstatePremiumGbp("DUB", 34), 6);
assert.equal(getAirportEstatePremiumGbp("DUB", 45), 6);
assert.equal(getAirportEstatePremiumGbp("DUB", 140), 6);
console.log("OK  Live estate premium always £6 (universal); historical tiers not applied");

// BHD city ~4 mi → £30 / estate £36
{
  const m = metricsForMiles(4, 12);
  const bhdCity = calculateQuote(cityHall, "BHD", SALOON, false, {}, m);
  assert.ok(bhdCity);
  assert.equal(bhdCity.amount, 30, "BHD city saloon ~4 mi → £30");
  const bhdCityEstate = calculateQuote(cityHall, "BHD", ESTATE, false, {}, m);
  assert.equal(bhdCityEstate?.amount, 36, "BHD city estate = 30+6");
  console.log(`OK  BHD City Hall saloon £${bhdCity.amount} / estate £${bhdCityEstate?.amount}`);
}

// DUB 98 mi drop £234; BFS 14 mi £48
{
  const dubM = metricsForMiles(98, 115);
  const bfsM = metricsForMiles(14, 25);
  const dubCity = calculateQuote(cityHall, "DUB", SALOON, false, {}, dubM);
  const bfsCity = calculateQuote(cityHall, "BFS", SALOON, false, {}, bfsM);
  assert.equal(dubCity?.amount, 234, "DUB Belfast centre drop-off = £230 + £4 M1");
  assert.equal(bfsCity?.amount, 48, "BFS City Hall 14 mi → £48");
  console.log(`OK  DUB City Hall £${dubCity?.amount}; BFS City Hall £${bfsCity?.amount}`);
}

// Direction-symmetric Holywood↔BHD
{
  const m = metricsForMiles(6, 15);
  const toAirport = calculateQuote(holywood, "BHD", SALOON, false, {}, m);
  const fromAirport = calculateQuote(holywood, "BHD", SALOON, false, {}, m, true);
  assert.equal(toAirport?.amount, fromAirport?.amount, "same fare either direction");
  assert.equal(toAirport?.amount, calculateUniversalSaloonJourneyFareGbp(6));
  console.log(`OK  Direction-symmetric Holywood↔BHD £${toAirport?.amount}`);
}

// Weekend = weekday (premium 0) with metrics
{
  const m = metricsForMiles(14, 25);
  const weekend = calculateQuote(cityHall, "BFS", SALOON, false, {
    outboundDate: "2026-08-22", // Saturday
    outboundTime: "10:00",
  }, m);
  const weekday = calculateQuote(cityHall, "BFS", SALOON, false, {
    outboundDate: "2026-08-19", // Wednesday
    outboundTime: "10:00",
  }, m);
  assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0);
  assert.ok(weekday);
  assert.equal(weekday.premiumApplied, false);
  assert.ok(weekend);
  assert.equal(weekend.premiumApplied, false);
  assert.equal(
    weekend.amount,
    weekday.amount,
    `airport weekend fare (£${weekend.amount}) must equal weekday (£${weekday.amount})`,
  );
  assert.equal(weekday.amount, 48);
  console.log(
    `OK  Airport weekday = weekend £${weekday.amount} (no Bank Holiday / weekend surcharge)`,
  );
}

// Floor disabled — applyBelfastAirportDistanceFloor is a no-op
{
  const before = 80;
  assert.equal(applyBelfastAirportDistanceFloor(before, "BHD", 29.4 * 1.60934), before);
  console.log("OK  belfastAirportDistanceFloor disabled (no-op)");
}

const a2a = calculatePointToPointQuote(
  cityHall,
  "1 Marcus Square, Newry BT35 8DQ",
  SALOON,
  false,
  {},
  { distanceKm: 60, durationMinutes: 55 },
);
assert.ok(a2a && a2a.amount > 0);
assert.equal(
  calculatePointToPointQuote(cityHall, "1 Marcus Square, Newry BT35 8DQ", SALOON),
  null,
  "A2A without route metrics must not invent a fare",
);
console.log(`OK  A2A still requires route metrics (sample £${a2a.amount})`);

{
  const m = metricsForMiles(14, 25);
  const bfsCity = calculateQuote(cityHall, "BFS", SALOON, false, {}, m);
  const bfsEstate = calculateQuote(cityHall, "BFS", ESTATE, false, {}, m);
  const minibus = calculateQuote(cityHall, "BFS", MINIBUS, false, {}, m);
  assert.ok(minibus && minibus.amount > (bfsEstate?.amount ?? 0));
  assert.equal(bfsCity?.amount, 48);
  assert.equal(bfsEstate?.amount, calculateUniversalEstateJourneyFareGbp(48));
  console.log(`OK  Minibus still prices above estate (£${minibus.amount} > £${bfsEstate?.amount})`);
}

console.log("\nAll airport pricing revision checks passed.");
